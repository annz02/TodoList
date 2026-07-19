#[tauri::command]
fn save_todos(data: String) -> Result<(), String> {
    std::fs::write("todos.json", data).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_todos() -> Result<String, String> {
    std::fs::read_to_string("todos.json").or_else(|_| Ok("[]".to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![save_todos, load_todos])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
