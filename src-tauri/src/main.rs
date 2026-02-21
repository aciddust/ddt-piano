// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod arrange;

use arrange::{apply_three_octave_arrangement, Score};
use serde::Serialize;
use sysinfo::System;
use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow,
    ShowWindow, SW_RESTORE, PostMessageA, WM_KEYDOWN, WM_KEYUP, WM_CHAR,
};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYEVENTF_KEYUP, MapVirtualKeyA, MAPVK_VK_TO_VSC,
};
use std::collections::HashMap;
use std::sync::Mutex;

static TARGET_HWND: Mutex<HWND> = Mutex::new(0);

fn get_virtual_key_code(ch: char) -> Option<u16> {
    let mut map = HashMap::new();
    
    // 숫자
    map.insert('0', 0x30);
    map.insert('1', 0x31);
    map.insert('2', 0x32);
    map.insert('3', 0x33);
    map.insert('4', 0x34);
    map.insert('5', 0x35);
    map.insert('6', 0x36);
    map.insert('7', 0x37);
    map.insert('8', 0x38);
    map.insert('9', 0x39);
    
    // 알파벳
    map.insert('a', 0x41);
    map.insert('b', 0x42);
    map.insert('c', 0x43);
    map.insert('d', 0x44);
    map.insert('e', 0x45);
    map.insert('f', 0x46);
    map.insert('g', 0x47);
    map.insert('h', 0x48);
    map.insert('i', 0x49);
    map.insert('j', 0x4A);
    map.insert('k', 0x4B);
    map.insert('l', 0x4C);
    map.insert('m', 0x4D);
    map.insert('n', 0x4E);
    map.insert('o', 0x4F);
    map.insert('p', 0x50);
    map.insert('q', 0x51);
    map.insert('r', 0x52);
    map.insert('s', 0x53);
    map.insert('t', 0x54);
    map.insert('u', 0x55);
    map.insert('v', 0x56);
    map.insert('w', 0x57);
    map.insert('x', 0x58);
    map.insert('y', 0x59);
    map.insert('z', 0x5A);
    
    // 특수 문자
    map.insert(',', 0xBC); // VK_OEM_COMMA
    map.insert('.', 0xBE); // VK_OEM_PERIOD
    map.insert('/', 0xBF); // VK_OEM_2
    map.insert(';', 0xBA); // VK_OEM_1
    map.insert('[', 0xDB); // VK_OEM_4
    map.insert(']', 0xDD); // VK_OEM_6
    map.insert('-', 0xBD); // VK_OEM_MINUS
    map.insert('=', 0xBB); // VK_OEM_PLUS
    
    map.get(&ch.to_ascii_lowercase()).copied()
}

// Tauri 명령어 정의
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[derive(Serialize)]
struct ProcessInfo {
    pid: u32,
    name: String,
}

#[tauri::command]
fn list_processes() -> Vec<ProcessInfo> {
    let mut system = System::new_all();
    system.refresh_processes();

    let mut processes: Vec<ProcessInfo> = system
        .processes()
        .values()
        .map(|process| ProcessInfo {
            pid: process.pid().as_u32(),
            name: process.name().to_string(),
        })
        .collect();

    processes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    processes
}

struct FindWindowData {
    pid: u32,
    hwnd: HWND,
}

unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let data = &mut *(lparam as *mut FindWindowData);
    let mut window_pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, &mut window_pid);

    if window_pid == data.pid && IsWindowVisible(hwnd) != 0 {
        data.hwnd = hwnd;
        return 0;
    }

    1
}

fn find_window_by_pid(pid: u32) -> Option<HWND> {
    let mut data = FindWindowData { pid, hwnd: 0 };
    unsafe {
        EnumWindows(Some(enum_windows_proc), &mut data as *mut _ as LPARAM);
    }
    if data.hwnd != 0 {
        Some(data.hwnd)
    } else {
        None
    }
}

#[tauri::command]
fn focus_process(pid: u32) -> Result<(), String> {
    let hwnd = find_window_by_pid(pid).ok_or_else(|| "Window not found".to_string())?;
    
    // 타겟 윈도우 핸들 저장
    if let Ok(mut target) = TARGET_HWND.lock() {
        *target = hwnd;
    }
    
    unsafe {
        ShowWindow(hwnd, SW_RESTORE);
        if SetForegroundWindow(hwnd) == 0 {
            return Err("Failed to focus window".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
fn press_key(key: String) -> Result<(), String> {
    let hwnd = TARGET_HWND.lock()
        .map_err(|_| "Failed to lock target window".to_string())?;
    
    if *hwnd == 0 {
        return Err("No target window selected".to_string());
    }

    for ch in key.chars() {
        let vk_code = get_virtual_key_code(ch)
            .ok_or_else(|| format!("Unsupported key: {}", ch))?;

        unsafe {
            let scan_code = MapVirtualKeyA(vk_code as u32, MAPVK_VK_TO_VSC);
            let lparam_down = (scan_code << 16) | 1;
            let lparam_up = (scan_code << 16) | 0xC0000001;

            // 방법 1: PostMessage로 윈도우에 직접 전송
            PostMessageA(*hwnd, WM_KEYDOWN, vk_code as usize, lparam_down as isize);
            std::thread::sleep(std::time::Duration::from_millis(20));
            PostMessageA(*hwnd, WM_CHAR, ch as usize, lparam_down as isize);
            std::thread::sleep(std::time::Duration::from_millis(20));
            PostMessageA(*hwnd, WM_KEYUP, vk_code as usize, lparam_up as isize);
            std::thread::sleep(std::time::Duration::from_millis(60));

            // 방법 2: 전역 keybd_event (백업)
            keybd_event(vk_code as u8, scan_code as u8, 0, 0);
            std::thread::sleep(std::time::Duration::from_millis(20));
            keybd_event(vk_code as u8, scan_code as u8, KEYEVENTF_KEYUP, 0);
            std::thread::sleep(std::time::Duration::from_millis(60));
        }
    }

    Ok(())
}

// 여러 키를 동시에 누르기 (최적화: 일괄 전송, 딜레이 최소화)
#[tauri::command]
fn key_down(keys: Vec<String>) -> Result<(), String> {
    let hwnd = TARGET_HWND.lock()
        .map_err(|_| "Failed to lock target window".to_string())?;
    
    if *hwnd == 0 {
        return Err("No target window selected".to_string());
    }

    unsafe {
        // 전역 keybd_event만 사용 (가장 빠르고 안정적)
        for key_str in &keys {
            for ch in key_str.chars() {
                let vk_code = get_virtual_key_code(ch)
                    .ok_or_else(|| format!("Unsupported key: {}", ch))?;
                let scan_code = MapVirtualKeyA(vk_code as u32, MAPVK_VK_TO_VSC);
                keybd_event(vk_code as u8, scan_code as u8, 0, 0);
            }
        }
    }

    Ok(())
}

// 눌린 키들을 떼기 (최적화: 일괄 전송, 딜레이 최소화)
#[tauri::command]
fn key_up(keys: Vec<String>) -> Result<(), String> {
    let hwnd = TARGET_HWND.lock()
        .map_err(|_| "Failed to lock target window".to_string())?;
    
    if *hwnd == 0 {
        return Err("No target window selected".to_string());
    }

    unsafe {
        // 전역 keybd_event만 사용 (가장 빠르고 안정적)
        for key_str in &keys {
            for ch in key_str.chars() {
                let vk_code = get_virtual_key_code(ch)
                    .ok_or_else(|| format!("Unsupported key: {}", ch))?;
                let scan_code = MapVirtualKeyA(vk_code as u32, MAPVK_VK_TO_VSC);
                keybd_event(vk_code as u8, scan_code as u8, KEYEVENTF_KEYUP, 0);
            }
        }
    }

    Ok(())
}

// 3옥타브 편곡 적용 (C2~C5 범위로 조정)
#[tauri::command]
fn apply_arrangement(score: Score) -> Result<Score, String> {
    Ok(apply_three_octave_arrangement(&score))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_version,
            list_processes,
            focus_process,
            press_key,
            key_down,
            key_up,
            apply_arrangement,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
