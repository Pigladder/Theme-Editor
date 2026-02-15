use tauri::{Manager, Emitter, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            
            // 克隆 window 用于闭包
            let window_clone = window.clone();
            
            window.on_window_event(move |event| {
                if let WindowEvent::DragDrop(drag_event) = event {
                    if let tauri::DragDropEvent::Drop { paths, .. } = drag_event {
                        if let Some(path) = paths.first() {
                            let _ = window_clone.emit("file-dropped", path.to_string_lossy().to_string());
                        }
                    }
                }
            });
            
            #[cfg(debug_assertions)]
            {
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}