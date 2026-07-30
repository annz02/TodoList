use std::sync::Arc;
use tauri::Manager;

mod update;
use update::UpdateState;

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
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .creation_flags(CREATE_NO_WINDOW)
            .args(&["/c", "start", "", &url])
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
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
        save_todos, load_todos, save_settings, load_settings,
        get_git_commits, select_folder, open_url,
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

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
