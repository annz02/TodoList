use std::sync::Arc;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

mod update;
use update::UpdateState;

mod search;


#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
fn save_todos(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("todos.json");
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_todos(app: tauri::AppHandle) -> Result<String, String> {
    let path = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("todos.json");
    std::fs::read_to_string(path).or_else(|_| Ok("[]".to_string()))
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("settings.json");
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<String, String> {
    let path = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("settings.json");
    std::fs::read_to_string(path).or_else(|_| Ok("{}".to_string()))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DockAnchor {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    scale_factor: f64,
}

/// Work-area rect (taskbar excluded) of the monitor the sticky window is on,
/// in physical pixels, plus the scale factor needed to convert logical->physical.
#[tauri::command]
fn get_dock_anchor(window: tauri::Window) -> Result<DockAnchor, String> {
    let mon = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "no monitor available".to_string())?;
    let wa = mon.work_area();
    Ok(DockAnchor {
        x: wa.position.x,
        y: wa.position.y,
        width: wa.size.width,
        height: wa.size.height,
        scale_factor: mon.scale_factor(),
    })
}

/// Atomically reposition+resize the window to a physical rect in one Go so the
/// right edge stays pinned without flicker between separate size/position calls.
#[tauri::command]
fn apply_dock_geometry(window: tauri::Window, x: i32, y: i32, width: u32, height: u32) -> Result<(), String> {
    window
        .set_size(tauri::PhysicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Physical REST pose: a tall, very narrow strip flush to the work-area's right
/// edge (exclusive of the Windows taskbar), vertically centered on it.
fn rest_dock_geometry(anchor: &DockAnchor, rest_w_px: u32) -> (i32, i32, u32, u32) {
    const EDGE_GAP_PX: i32 = 0;
    let right_phys = anchor.x + anchor.width as i32 - EDGE_GAP_PX;
    let x = right_phys - rest_w_px as i32;
    // Centered vertically with a small top/bottom breathing gap.
    let gap = 4_i32;
    let y = anchor.y + gap;
    let h = (anchor.height as i64 - 2 * gap as i64).max(0) as u32;
    (x, y, rest_w_px, h)
}

#[tauri::command]
fn get_git_commits(repo_path: String, date_str: String) -> Result<String, String> {
    let trimmed_path = repo_path.trim();
    if trimmed_path.is_empty() {
        return Ok(String::new());
    }

    let path = std::path::Path::new(trimmed_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("Git 路径不存在或不是有效的目录: {}", trimmed_path));
    }

    // 1. 自动获取当前用户在该仓库/全局 Git 配置中的 user.email 或 user.name
    let author_email_output = std::process::Command::new("git")
        .current_dir(path)
        .args(&["config", "user.email"])
        .output();

    let author_name_output = std::process::Command::new("git")
        .current_dir(path)
        .args(&["config", "user.name"])
        .output();

    let mut author_arg: Option<String> = None;

    if let Ok(out) = author_email_output {
        if out.status.success() {
            let email = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !email.is_empty() {
                author_arg = Some(email);
            }
        }
    }

    if author_arg.is_none() {
        if let Ok(out) = author_name_output {
            if out.status.success() {
                let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !name.is_empty() {
                    author_arg = Some(name);
                }
            }
        }
    }

    let since = format!("{} 00:00:00", date_str);
    let until = format!("{} 23:59:59", date_str);

    // 1. 尝试带 author 过滤获取 git log
    if let Some(author) = &author_arg {
        let output = std::process::Command::new("git")
            .current_dir(path)
            .args(&[
                "log",
                &format!("--since={}", since),
                &format!("--until={}", until),
                &format!("--author={}", author),
                "--pretty=format:- %s (%h)",
                "--no-merges",
            ])
            .output();

        if let Ok(out) = output {
            if out.status.success() {
                let commits = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !commits.is_empty() {
                    return Ok(commits);
                }
            }
        }
    }

    // 2. 回退机制：若 author 过滤无匹配（或未设 author），不带 --author 检索当天所有提交
    let output = std::process::Command::new("git")
        .current_dir(path)
        .args(&[
            "log",
            &format!("--since={}", since),
            &format!("--until={}", until),
            "--pretty=format:- %s (%h)",
            "--no-merges",
        ])
        .output()
        .map_err(|e| format!("无法执行 git 命令: {}", e))?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git 命令未成功执行: {}", err_msg.trim()));
    }

    let commits = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(commits)
}

#[tauri::command]
fn select_folder() -> Option<String> {
    let folder = rfd::FileDialog::new().pick_folder();
    folder.map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    // Only allow http/https links. This keeps the raw URL out of shell context
    // (cmd /c start, xdg-open, open) and prevents opening local files/危 schemes.
    let lower = url.trim().to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) {
        return Err("仅允许打开 http/https 链接".into());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/c", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn open_path_in_explorer(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("路径不能为空".into());
    }
    let p = std::path::Path::new(trimmed);
    if !p.exists() {
        return Err(format!("路径不存在: {}", trimmed));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .creation_flags(CREATE_NO_WINDOW)
            .arg(trimmed)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn open_path_in_editor(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("路径不能为空".into());
    }
    let p = std::path::Path::new(trimmed);
    if !p.exists() {
        return Err(format!("路径不存在: {}", trimmed));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["/c", "code", trimmed])
            .spawn()
            .map_err(|e| format!("无法启动 VS Code，请确认已安装并加入 PATH: {}", e))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("code")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("无法启动 VS Code: {}", e))?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("code")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("无法启动 VS Code: {}", e))?;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[cfg(target_os = "windows")]
  {
    std::env::set_var(
      "WEBVIEW2_ADDITIONAL_BROWSER_ARGS",
      "--disable-gpu-shader-disk-cache --disable-component-update --enable-features=MemorySaverMode --num-raster-threads=1",
    );
  }

  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
      }
    }))
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
        save_todos, load_todos, save_settings, load_settings,
        get_dock_anchor, apply_dock_geometry,
        get_git_commits, select_folder, open_url,
        open_path_in_explorer, open_path_in_editor,
        search::web_search,
        search::fetch_webpage,
        search::ai_chat_proxy,
        update::get_update_state,
        update::check_for_updates,
        update::install_update,
        update::set_update_debug_state
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let update_state = Arc::new(UpdateState::new(
        app.package_info().version.to_string(),
      ));
      app.manage(update_state.clone());
      update::spawn_startup_check(app.handle().clone(), update_state);

      // Desktop sticky-note window showing today's tasks, docked to the right edge
      // of the work area. Created eager, then snapped to the REST pose immediately
      // so it never flashes at the origin. Its frontend (StickyNote.vue) re-derives
      // the same pose on mount and animates rest→fan→open via apply_dock_geometry.
      const REST_W_PX: u32 = 8;
      let sticky = tauri::WebviewWindowBuilder::new(
        app,
        "sticky",
        tauri::WebviewUrl::App("sticky.html".into()),
      )
      .title("今日便签")
      .inner_size(8.0, 600.0)
      .resizable(false)
      .decorations(false)
      .always_on_top(true)
      .transparent(true)
      .shadow(false)
      .skip_taskbar(true)
      .focused(false)
      .build()?;

      if let Some(anchor) = sticky.current_monitor().ok().flatten() {
        let wa = anchor.work_area();
        let dock = DockAnchor {
          x: wa.position.x,
          y: wa.position.y,
          width: wa.size.width,
          height: wa.size.height,
          scale_factor: anchor.scale_factor(),
        };
        let (x, y, w, h) = rest_dock_geometry(&dock, REST_W_PX);
        let _ = sticky.set_position(tauri::PhysicalPosition::new(x, y));
        let _ = sticky.set_size(tauri::PhysicalSize::new(w, h));
      }

      // System tray so the always-on-top, skip-taskbar dock stays reachable.
      let menu = Menu::with_items(
        app,
        &[
          &MenuItem::with_id(app, "toggle", "显示 / 隐藏 便签", true, None::<&str>)?,
          &PredefinedMenuItem::separator(app)?,
          &MenuItem::with_id(app, "quit", "退出 Todolist", true, None::<&str>)?,
        ],
      )?;
      let tray_icon = app
        .default_window_icon()
        .cloned()
        .expect("bundle icon should be set for the tray");
      let _tray = TrayIconBuilder::with_id("sticky-tray")
        .icon(tray_icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "toggle" => {
            if let Some(w) = app.get_webview_window("sticky") {
              if w.is_visible().unwrap_or(false) {
                let _ = w.hide();
              } else {
                let _ = w.show();
                let _ = w.set_focus();
              }
            }
          }
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            if let Some(w) = tray.app_handle().get_webview_window("sticky") {
              if w.is_visible().unwrap_or(false) {
                let _ = w.hide();
              } else {
                let _ = w.show();
                let _ = w.set_focus();
              }
            }
          }
        })
        .build(app)?;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
