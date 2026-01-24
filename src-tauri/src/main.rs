// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use std::fs;
use std::path::PathBuf;

// --- Data Structures ---

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct Position { x: f64, y: f64 }

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct Size { w: f64, h: f64 }

#[derive(serde::Serialize, serde::Deserialize, Debug)]
struct StickyNote {
    id: String,
    title: String,
    content: String,
    #[serde(rename = "inkData")]
    ink_data: Option<String>,
    mode: String,
    #[serde(rename = "isMinimized")]
    is_minimized: bool,
    #[serde(rename = "isPinned")]
    is_pinned: Option<bool>,
    position: Position,
    size: Size,
    #[serde(rename = "zIndex")]
    z_index: i64,
    color: String,
}

// --- Helper Functions ---

// Resolves to $APPDATA/RedPillCharting/Database/
fn get_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir()
        .map_err(|e| e.to_string())
        .map(|p| p.join("RedPillCharting").join("Database"))
}

// --- Commands ---

#[tauri::command]
fn ping() -> String {
    "pong".to_string()
}

#[tauri::command]
fn read_csv(file_path: String) -> Result<String, String> {
    // Mandate 0.2: Direct file read for Stream A
    println!("[Tauri] Reading file: {}", file_path);
    fs::read_to_string(file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_chart_state(app: tauri::AppHandle, source_id: String, state: String) -> Result<(), String> {
    // Mandate 0.11.2: Scoped Persistence
    let root = get_db_path(&app)?.join("Drawings");
    
    if !root.exists() {
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    }
    
    // Sanitize ID to prevent path traversal
    let safe_id = source_id.replace(|c: char| !c.is_alphanumeric() && c != '_' && c != '-', "_");
    let path = root.join(format!("{}.json", safe_id));
    
    fs::write(path, state).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_sticky_notes(app: tauri::AppHandle, notes: Vec<StickyNote>) -> Result<(), String> {
    // Mandate 4.4: Sticky Note Persistence
    let root = get_db_path(&app)?.join("StickyNotes");
    
    if !root.exists() {
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    }
    
    let path = root.join("sticky_notes.json");
    let json = serde_json::to_string_pretty(&notes).map_err(|e| e.to_string())?;
    
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_sticky_notes(app: tauri::AppHandle) -> Result<Vec<StickyNote>, String> {
    let path = get_db_path(&app)?.join("StickyNotes").join("sticky_notes.json");
    
    if !path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let notes = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(notes)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ping,
            read_csv,
            save_chart_state,
            save_sticky_notes,
            load_sticky_notes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
