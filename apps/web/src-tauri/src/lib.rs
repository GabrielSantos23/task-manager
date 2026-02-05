use std::sync::Mutex;
use std::collections::{HashSet, HashMap};
use tauri::State;
use sysinfo::{System, Pid, Networks, Disks};
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowThreadProcessId, IsWindowVisible, GetWindowRect,
    GetIconInfo, DestroyIcon,
};
use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
use windows::Win32::Graphics::Gdi::{
    GetDC, ReleaseDC, CreateCompatibleDC, DeleteDC, GetObjectW,
    GetDIBits, DeleteObject, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
};
use windows::Win32::System::Performance::*;
use windows::core::PCWSTR;
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use std::io::Cursor;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use image::{RgbaImage, ImageOutputFormat};

struct AppState {
    sys: Mutex<System>,
    networks: Mutex<Networks>,
    gpu_monitor: Mutex<GpuMonitor>,
    network_monitor: Mutex<NetworkMonitor>,
    system_metrics_monitor: Mutex<SystemMetricsMonitor>,
    icon_cache: Mutex<HashMap<String, String>>,
    app_history: Mutex<HashMap<String, AppHistoryEntry>>,

    gpu_info_cache: Mutex<Option<(String, u64, String, String, String)>>,
    memory_info_cache: Mutex<Option<MemoryConfigInfo>>,
    last_update: Mutex<std::time::Instant>,
}
 
#[derive(Clone)]
struct AppHistoryEntry {
    cpu_time_ms: u64,      
    network_bytes: u64,    
    disk_bytes: u64,       
    icon: Option<String>,  
}

struct GpuMonitor {
    query: isize,
    utilization_counter: isize,
    memory_counter: isize,
    shared_memory_counter: isize,
    initialized: bool,
}

unsafe impl Send for GpuMonitor {}

impl GpuMonitor {
    fn new() -> Self {
        Self {
            query: 0,
            utilization_counter: 0,
            memory_counter: 0,
            shared_memory_counter: 0,
            initialized: false,
        }
    }

    fn refresh(&mut self) -> (HashMap<u32, f32>, u64, u64) {
        let mut usage_map = HashMap::new();
        let mut total_memory = 0;
        let mut total_shared_memory = 0;

        unsafe {
            if !self.initialized {
                let open_res = PdhOpenQueryW(None, 0, &mut self.query);
                if open_res == 0 {
                    let util_path = to_wstring("\\GPU Engine(*)\\Utilization Percentage");
                    let mem_path = to_wstring("\\GPU Adapter Memory(*)\\Dedicated Usage");
                    let shared_mem_path = to_wstring("\\GPU Adapter Memory(*)\\Shared Usage");
                    
                    let add_util = PdhAddEnglishCounterW(self.query, PCWSTR(util_path.as_ptr()), 0, &mut self.utilization_counter);
                    let add_mem = PdhAddEnglishCounterW(self.query, PCWSTR(mem_path.as_ptr()), 0, &mut self.memory_counter);
                    let add_shared = PdhAddEnglishCounterW(self.query, PCWSTR(shared_mem_path.as_ptr()), 0, &mut self.shared_memory_counter);
                    
                    if add_util == 0 && add_mem == 0 && add_shared == 0 {
                        self.initialized = true;
                        println!("PDH GPU Monitor Initialized Successfully");
                    }
                }
            }

            if self.initialized {
                if PdhCollectQueryData(self.query) == 0 {
                    let mut buffer_size = 0;
                    let mut item_count = 0;
                    let _ = PdhGetFormattedCounterArrayW(self.utilization_counter, PDH_FMT_DOUBLE, &mut buffer_size, &mut item_count, None);

                    if item_count > 0 {
                        let mut buffer = vec![0u8; buffer_size as usize];
                        let items_ptr = buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
                        if PdhGetFormattedCounterArrayW(self.utilization_counter, PDH_FMT_DOUBLE, &mut buffer_size, &mut item_count, Some(items_ptr)) == 0 {
                            let items = std::slice::from_raw_parts(items_ptr, item_count as usize);
                            for item in items {
                                if !item.szName.is_null() {
                                    let name = item.szName.to_string().unwrap_or_default();
                                    if let Some(pos) = name.find("pid_") {
                                        let start = pos + 4;
                                        let mut end = start;
                                        let bytes = name.as_bytes();
                                        while end < bytes.len() && (bytes[end] as char).is_digit(10) {
                                            end += 1;
                                        }
                                        if let Ok(pid) = name[start..end].parse::<u32>() {
                                            let val = item.FmtValue.Anonymous.doubleValue;
                                            *usage_map.entry(pid).or_insert(0.0) += val as f32;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    let mut mem_buffer_size = 0;
                    let mut mem_item_count = 0;
                    let _ = PdhGetFormattedCounterArrayW(self.memory_counter, PDH_FMT_LARGE, &mut mem_buffer_size, &mut mem_item_count, None);

                    if mem_item_count > 0 {
                        let mut buffer = vec![0u8; mem_buffer_size as usize];
                        let items_ptr = buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
                        if PdhGetFormattedCounterArrayW(self.memory_counter, PDH_FMT_LARGE, &mut mem_buffer_size, &mut mem_item_count, Some(items_ptr)) == 0 {
                            let items = std::slice::from_raw_parts(items_ptr, mem_item_count as usize);
                            for item in items {
                                let val = item.FmtValue.Anonymous.largeValue;
                                total_memory += val as u64;
                            }
                        }
                    }

                    let mut shared_buffer_size = 0;
                    let mut shared_item_count = 0;
                    let _ = PdhGetFormattedCounterArrayW(self.shared_memory_counter, PDH_FMT_LARGE, &mut shared_buffer_size, &mut shared_item_count, None);

                    if shared_item_count > 0 {
                        let mut buffer = vec![0u8; shared_buffer_size as usize];
                        let items_ptr = buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
                        if PdhGetFormattedCounterArrayW(self.shared_memory_counter, PDH_FMT_LARGE, &mut shared_buffer_size, &mut shared_item_count, Some(items_ptr)) == 0 {
                            let items = std::slice::from_raw_parts(items_ptr, shared_item_count as usize);
                            for item in items {
                                let val = item.FmtValue.Anonymous.largeValue;
                                total_shared_memory += val as u64;
                            }
                        }
                    }
                }
            }
        }
        (usage_map, total_memory, total_shared_memory)
    }
}

struct NetworkMonitor {
    query: isize,
    io_counter: isize,
    pid_counter: isize,
    initialized: bool,
}

unsafe impl Send for NetworkMonitor {}

impl NetworkMonitor {
    fn new() -> Self {
        Self {
            query: 0,
            io_counter: 0,
            pid_counter: 0,
            initialized: false,
        }
    }

    fn refresh(&mut self) -> HashMap<u32, u64> {
        let mut usage_map = HashMap::new();
        unsafe {
            if !self.initialized {
                if PdhOpenQueryW(None, 0, &mut self.query) == 0 {
                    let io_path = to_wstring("\\Process(*)\\IO Other Bytes/sec");
                    let pid_path = to_wstring("\\Process(*)\\ID Process");
                    let res1 = PdhAddEnglishCounterW(self.query, PCWSTR(io_path.as_ptr()), 0, &mut self.io_counter);
                    let res2 = PdhAddEnglishCounterW(self.query, PCWSTR(pid_path.as_ptr()), 0, &mut self.pid_counter);
                    if res1 == 0 && res2 == 0 {
                        self.initialized = true;
                        println!("PDH Network Monitor Initialized Successfully");
                    }
                }
            }

            if self.initialized {
                if PdhCollectQueryData(self.query) == 0 {
                    let mut io_buffer_size = 0;
                    let mut io_item_count = 0;
                    let _ = PdhGetFormattedCounterArrayW(self.io_counter, PDH_FMT_DOUBLE, &mut io_buffer_size, &mut io_item_count, None);

                    let mut pid_buffer_size = 0;
                    let mut pid_item_count = 0;
                    let _ = PdhGetFormattedCounterArrayW(self.pid_counter, PDH_FMT_DOUBLE, &mut pid_buffer_size, &mut pid_item_count, None);

                    if io_item_count > 0 && pid_item_count > 0 {
                        let mut io_buffer = vec![0u8; io_buffer_size as usize];
                        let mut pid_buffer = vec![0u8; pid_buffer_size as usize];
                        let io_items_ptr = io_buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
                        let pid_items_ptr = pid_buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;

                        if PdhGetFormattedCounterArrayW(self.io_counter, PDH_FMT_DOUBLE, &mut io_buffer_size, &mut io_item_count, Some(io_items_ptr)) == 0 &&
                           PdhGetFormattedCounterArrayW(self.pid_counter, PDH_FMT_DOUBLE, &mut pid_buffer_size, &mut pid_item_count, Some(pid_items_ptr)) == 0 {
                            
                            let io_items = std::slice::from_raw_parts(io_items_ptr, io_item_count as usize);
                            let pid_items = std::slice::from_raw_parts(pid_items_ptr, pid_item_count as usize);

                            let mut name_to_pid = HashMap::new();
                            for item in pid_items {
                                if !item.szName.is_null() {
                                    let name = item.szName.to_string().unwrap_or_default();
                                    let pid = item.FmtValue.Anonymous.doubleValue as u32;
                                    name_to_pid.insert(name, pid);
                                }
                            }

                            for item in io_items {
                                if !item.szName.is_null() {
                                    let name = item.szName.to_string().unwrap_or_default();
                                    if let Some(&pid) = name_to_pid.get(&name) {
                                        let val = item.FmtValue.Anonymous.doubleValue;
                                        if val > 0.0 {
                                            *usage_map.entry(pid).or_insert(0) += val as u64;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        usage_map
    }
}

struct SystemMetricsMonitor {
    query: isize,
    counters: HashMap<String, isize>,
    initialized: bool,
}

unsafe impl Send for SystemMetricsMonitor {}

impl SystemMetricsMonitor {
    fn new() -> Self {
        Self {
            query: 0,
            counters: HashMap::new(),
            initialized: false,
        }
    }

    fn refresh(&mut self) -> HashMap<String, f64> {
        let mut results = HashMap::new();
        unsafe {
            if !self.initialized {
                if PdhOpenQueryW(None, 0, &mut self.query) == 0 {
                    let counters_to_add = vec![
                        ("threads", "\\System\\Threads"),
                        ("handles", "\\Process(_Total)\\Handle Count"),
                        ("committed", "\\Memory\\Committed Bytes"),
                        ("cached", "\\Memory\\Cache Bytes"),
                        ("pool_paged", "\\Memory\\Pool Paged Bytes"),
                        ("pool_nonpaged", "\\Memory\\Pool Nonpaged Bytes"),
                    ];

                    for (key, path) in counters_to_add {
                        let mut counter_handle = 0;
                        let wide_path = to_wstring(path);
                        if PdhAddEnglishCounterW(self.query, PCWSTR(wide_path.as_ptr()), 0, &mut counter_handle) == 0 {
                            self.counters.insert(key.to_string(), counter_handle);
                        }
                    }
                    self.initialized = true;
                    println!("PDH System Metrics Initialized");
                }
            }

            if self.initialized {
                if PdhCollectQueryData(self.query) == 0 {
                    for (key, handle) in &self.counters {
                        let mut type_ = 0;
                        let mut value = std::mem::zeroed();
                        if PdhGetFormattedCounterValue(*handle, PDH_FMT_DOUBLE, Some(&mut type_), &mut value) == 0 {
                            results.insert(key.clone(), value.Anonymous.doubleValue);
                        }
                    }
                }
            }
        }
        results
    }
}

#[derive(serde::Serialize, Clone)]
struct ProcessInfo {
    pid: u32,
    name: String,
    cpu_usage: f32,
    memory: u64,
    disk_usage: u64,
    network_usage: u64,
    gpu_usage: f32,
    is_app: bool,
    icon: Option<String>,
}

#[derive(serde::Serialize)]
struct DiskInfo {
    name: String,
    mount_point: String,
    total_space: u64,
    available_space: u64,
    usage_percent: f32,
    disk_type: String,
}

#[derive(serde::Serialize, Clone)]
struct MemoryConfigInfo {
    speed_mhz: u32,
    slots_used: u32,
    slots_total: u32,
    form_factor: String,
    hardware_reserved: u64,
}

#[derive(serde::Serialize)]
struct HardwareInfo {
    cpu_name: String,
    cpu_cores: usize,
    logical_processors: usize,
    gpu_name: String,
    gpu_memory_total: u64,
    gpu_driver_version: String,
    gpu_driver_date: String,
    gpu_location: String,
    memory_config: MemoryConfigInfo,
}

#[derive(serde::Serialize)]
struct SystemStats {
    total_memory: u64,
    used_memory: u64,
    total_cpu_usage: f32,
    cpu_usage_per_core: Vec<f32>,
    process_count: usize,
    uptime: u64,
    handle_count: u64,
    thread_count: u64,
    committed_memory: u64,
    cached_memory: u64,
    paged_pool: u64,
    non_paged_pool: u64,
    disk_total_usage: u64,
    network_total_usage: u64,
    gpu_total_usage: f32,
    gpu_memory_used: u64,
    gpu_shared_memory_used: u64,
    disks: Vec<DiskInfo>,
    hardware: HardwareInfo,
}

#[derive(serde::Serialize)]
struct ProcessesResponse {
    processes: Vec<ProcessInfo>,
    stats: SystemStats,
}

unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    if IsWindowVisible(hwnd).as_bool() {
        let mut rect = RECT::default();
        let _ = GetWindowRect(hwnd, &mut rect);
        if (rect.right - rect.left) > 0 && (rect.bottom - rect.top) > 0 {
            let mut pid = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid != 0 {
                let pids = &mut *(lparam.0 as *mut HashSet<u32>);
                pids.insert(pid);
            }
        }
    }
    BOOL(1) 
}

fn get_app_pids() -> HashSet<u32> {
    let mut pids = HashSet::new();
    unsafe {
        let _ = EnumWindows(
            Some(enum_windows_proc), 
            LPARAM(&mut pids as *mut _ as isize)
        );
    }
    pids
}

fn to_wstring(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn extract_icon_base64(path: &str) -> Option<String> {
    unsafe {
        let wide_path = to_wstring(path);
        let mut sh_file_info = SHFILEINFOW::default();
        
        let result = SHGetFileInfoW(
            windows::core::PCWSTR(wide_path.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut sh_file_info),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );

        if result == 0 || sh_file_info.hIcon.is_invalid() {
            return None;
        }

        let h_icon = sh_file_info.hIcon;
        let mut icon_info = std::mem::zeroed();
        if GetIconInfo(h_icon, &mut icon_info).is_err() {
            let _ = DestroyIcon(h_icon);
            return None;
        }

        let dc = GetDC(None);
        let mem_dc = CreateCompatibleDC(dc);
        let _ = ReleaseDC(None, dc);

        let mut bitmap: BITMAP = std::mem::zeroed();
        let h_bitmap = if !icon_info.hbmColor.is_invalid() {
            icon_info.hbmColor
        } else {
            icon_info.hbmMask
        };

        if GetObjectW(
            windows::Win32::Graphics::Gdi::HGDIOBJ(h_bitmap.0),
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bitmap as *mut _ as *mut _),
        ) == 0 {
            let _ = DeleteDC(mem_dc);
            let _ = DeleteObject(icon_info.hbmColor);
            let _ = DeleteObject(icon_info.hbmMask);
            let _ = DestroyIcon(h_icon);
            return None;
        }

        let width = bitmap.bmWidth;
        let height = bitmap.bmHeight;
        let size = (width * height * 4) as usize;
        let mut pixels: Vec<u8> = vec![0; size];

        let mut bi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, 
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0, 
                ..Default::default()
            },
            ..Default::default()
        };

        if GetDIBits(
            mem_dc,
            h_bitmap,
            0,
            height.abs() as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bi,
            DIB_RGB_COLORS,
        ) == 0 {
            let _ = DeleteDC(mem_dc);
            let _ = DeleteObject(icon_info.hbmColor);
            let _ = DeleteObject(icon_info.hbmMask);
            let _ = DestroyIcon(h_icon);
            return None;
        }
        
        let _ = DeleteDC(mem_dc);
        let _ = DeleteObject(icon_info.hbmColor);
        let _ = DeleteObject(icon_info.hbmMask);
        let _ = DestroyIcon(h_icon);

        for chunk in pixels.chunks_mut(4) {
            let b = chunk[0];
            let r = chunk[2];
            chunk[0] = r;
            chunk[2] = b;
        }

        if let Some(img_buffer) = RgbaImage::from_raw(width as u32, height.abs() as u32, pixels) {
             let mut png_data = Vec::new();
             if img_buffer.write_to(&mut Cursor::new(&mut png_data), ImageOutputFormat::Png).is_ok() {
                 return Some(format!("data:image/png;base64,{}", BASE64.encode(png_data)));
             }
        }
        
        None
    }
}

#[tauri::command]
fn get_processes(state: State<'_, AppState>) -> ProcessesResponse {
    let mut sys = state.sys.lock().unwrap();
    
    let mut prev_disk_usage = HashMap::new();
    for (pid, process) in sys.processes() {
        let usage = process.disk_usage();
        prev_disk_usage.insert(*pid, usage.total_read_bytes + usage.total_written_bytes);
    }

    sys.refresh_all();
    
    let mut networks = state.networks.lock().unwrap();
    networks.refresh(true);
    
    let mut network_total_usage = 0;
    for (_interface_name, data) in networks.iter() {
        network_total_usage += data.received() + data.transmitted();
    }
    
    let mut gpu_monitor = state.gpu_monitor.lock().unwrap();
    let (gpu_usage_map, gpu_memory_used, gpu_shared_memory_used) = gpu_monitor.refresh();

    let mut network_monitor = state.network_monitor.lock().unwrap();
    let network_usage_map = network_monitor.refresh();

    let app_pids = get_app_pids();
    let mut icon_cache = state.icon_cache.lock().unwrap();
    
    let mut total_disk_usage = 0;
    let mut total_gpu_usage = 0.0;

    let mut processes: Vec<ProcessInfo> = sys.processes().iter().map(|(pid, process)| {
        let is_app = app_pids.contains(&pid.as_u32());
        let mut icon = None;
        
        if is_app {
            if let Some(exe_path) = process.exe() {
                let path_str = exe_path.to_string_lossy().into_owned();
                if let Some(cached) = icon_cache.get(&path_str) {
                    icon = Some(cached.clone());
                } else {
                    if let Some(extracted) = extract_icon_base64(&path_str) {
                        icon = Some(extracted.clone());
                        icon_cache.insert(path_str, extracted);
                    }
                }
            }
        }

        let current_disk = process.disk_usage();
        let current_total = current_disk.total_read_bytes + current_disk.total_written_bytes;
        let prev_total = prev_disk_usage.get(pid).unwrap_or(&current_total);
        let disk_usage = if current_total >= *prev_total {
            current_total - *prev_total
        } else {
            0
        };
        
        total_disk_usage += disk_usage;
        
        let gpu_usage = *gpu_usage_map.get(&pid.as_u32()).unwrap_or(&0.0);
        total_gpu_usage += gpu_usage;

        let proc_network_usage = *network_usage_map.get(&pid.as_u32()).unwrap_or(&0);

        let num_cores = sys.cpus().len() as f32;
        let normalized_cpu = if num_cores > 0.0 {
            process.cpu_usage() / num_cores
        } else {
            process.cpu_usage()
        };

        ProcessInfo {
            pid: pid.as_u32(),
            name: process.name().to_string_lossy().into_owned(),
            cpu_usage: normalized_cpu,
            memory: process.memory(),
            disk_usage,
            network_usage: proc_network_usage,
            gpu_usage,
            is_app,
            icon,
        }
    }).collect();

    processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
    
    {
        let mut app_history = state.app_history.lock().unwrap();
        let mut last_update = state.last_update.lock().unwrap();
        let now = std::time::Instant::now();
        let elapsed_ms = now.duration_since(*last_update).as_millis() as u64;
        *last_update = now;
        
        let mut app_stats: HashMap<String, (f32, u64, u64, Option<String>)> = HashMap::new();
        for proc in &processes {
            let entry = app_stats.entry(proc.name.clone()).or_insert((0.0, 0, 0, None));
            entry.0 += proc.cpu_usage;          
            entry.1 += proc.network_usage;      
            entry.2 += proc.disk_usage;         
            if entry.3.is_none() && proc.icon.is_some() {
                entry.3 = proc.icon.clone();
            }
        }
        
        for (name, (cpu_pct, net_bytes, disk_bytes, icon)) in app_stats {
            let cpu_time_delta = (cpu_pct as u64 * elapsed_ms) / 100;
            
            let history_entry = app_history.entry(name).or_insert(AppHistoryEntry {
                cpu_time_ms: 0,
                network_bytes: 0,
                disk_bytes: 0,
                icon: None,
            });
            
            history_entry.cpu_time_ms += cpu_time_delta;
            history_entry.network_bytes += net_bytes;
            history_entry.disk_bytes += disk_bytes;
            if history_entry.icon.is_none() && icon.is_some() {
                history_entry.icon = icon;
            }
        }
    }

    let disks = Disks::new_with_refreshed_list();
    let disk_infos: Vec<DiskInfo> = disks.iter().map(|disk| {
        let total = disk.total_space();
        let available = disk.available_space();
        let used = total - available;
        let usage_percent = if total > 0 {
            (used as f32 / total as f32) * 100.0
        } else {
            0.0
        };
        
        let disk_type = match disk.kind() {
            sysinfo::DiskKind::SSD => "SSD".to_string(),
            sysinfo::DiskKind::HDD => "HDD".to_string(),
            _ => "Unknown".to_string(),
        };
        
        DiskInfo {
            name: disk.name().to_string_lossy().into_owned(),
            mount_point: disk.mount_point().to_string_lossy().into_owned(),
            total_space: total,
            available_space: available,
            usage_percent,
            disk_type,
        }
    }).collect();
    
    let cpu_name = if let Some(cpu) = sys.cpus().first() {
        cpu.brand().to_string()
    } else {
        "Unknown CPU".to_string()
    };
    let logical_processors = sys.cpus().len();
    let cpu_cores = sys.physical_core_count().unwrap_or(logical_processors);
    let cpu_usage_per_core: Vec<f32> = sys.cpus().iter().map(|cpu| cpu.cpu_usage()).collect();
    let (gpu_name, gpu_memory_total, gpu_driver_version, gpu_driver_date, gpu_location) = get_gpu_info(&state);
    let memory_config = get_memory_config(&state, sys.total_memory(), sys.used_memory());
    let process_count = processes.len();
    let system_metrics = state.system_metrics_monitor.lock().unwrap().refresh();
    let system_metrics = state.system_metrics_monitor.lock().unwrap().refresh();
    let uptime = System::uptime(); // Returns seconds
    
    ProcessesResponse {
        processes,
        stats: SystemStats {
            total_memory: sys.total_memory(),
            used_memory: sys.used_memory(),
            total_cpu_usage: sys.global_cpu_usage(),
            cpu_usage_per_core,
            process_count,
            uptime,
            handle_count: system_metrics.get("handles").copied().unwrap_or(0.0) as u64,
            thread_count: system_metrics.get("threads").copied().unwrap_or(0.0) as u64,
            committed_memory: system_metrics.get("committed").copied().unwrap_or(0.0) as u64,
            cached_memory: system_metrics.get("cached").copied().unwrap_or(0.0) as u64,
            paged_pool: system_metrics.get("pool_paged").copied().unwrap_or(0.0) as u64,
            non_paged_pool: system_metrics.get("pool_nonpaged").copied().unwrap_or(0.0) as u64,
            
            disk_total_usage: total_disk_usage,
            network_total_usage,
            gpu_total_usage: total_gpu_usage,
            gpu_memory_used,
            gpu_shared_memory_used,
            disks: disk_infos,
            hardware: HardwareInfo {
                cpu_name,
                cpu_cores,
                logical_processors,
                gpu_name,
                gpu_memory_total,
                gpu_driver_version,
                gpu_driver_date,
                gpu_location,
                memory_config,
            },
        }
    }
}

fn get_gpu_info(state: &State<'_, AppState>) -> (String, u64, String, String, String) {
    let mut cache = state.gpu_info_cache.lock().unwrap();
    if let Some(info) = cache.as_ref() {
        return info.clone();
    }

    use std::process::Command;
    use std::os::windows::process::CommandExt;
    
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = Command::new("powershell")
        .args([
            "-NoProfile", 
            "-Command", 
            "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM, DriverVersion, DriverDate, PNPDeviceID | ConvertTo-Json -Compress"
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    
    let mut name = "Unknown GPU".to_string();
    let mut memory = 0u64;
    let mut version = "Unknown".to_string();
    let mut date_str = "Unknown".to_string();
    let mut location = "PCI bus".to_string();
    let mut pnp_id = "".to_string();

    if let Ok(output) = output {
        let output_str = String::from_utf8_lossy(&output.stdout);
        #[derive(serde::Deserialize)]
        struct GpuInfoRaw {
            Name: Option<String>,
            AdapterRAM: Option<u64>,
            DriverVersion: Option<String>,
            DriverDate: Option<String>,
            PNPDeviceID: Option<String>,
        }

        fn extract_data(gpu: &GpuInfoRaw) -> (String, u64, String, String, String) {
             let n = gpu.Name.clone().unwrap_or("Unknown".to_string());
             let m = gpu.AdapterRAM.unwrap_or(0);
             let v = gpu.DriverVersion.clone().unwrap_or("Unknown".to_string());
             
             let d_raw = gpu.DriverDate.clone().unwrap_or("Unknown".to_string());
             let d = if d_raw.starts_with("/Date(") {
                 if let Some(start) = d_raw.find('(') {
                      if let Some(end) = d_raw.find(')') {
                          if let Ok(ms) = d_raw[start+1..end].parse::<i64>() {
                                use std::time::{UNIX_EPOCH, Duration};
                                if UNIX_EPOCH.checked_add(Duration::from_millis(ms as u64)).is_some() {
                                     d_raw
                                } else { d_raw }
                          } else { d_raw }
                      } else { d_raw }
                  } else { d_raw }
             } else {
                 d_raw
             };
             
             let pid = gpu.PNPDeviceID.clone().unwrap_or_default();
             (n, m, v, d, pid)
        }

        if let Ok(gpus) = serde_json::from_str::<Vec<GpuInfoRaw>>(&output_str) {
             if let Some(gpu) = gpus.first() {
                 let (n, m, v, d, pid) = extract_data(gpu);
                 name = n; memory = m; version = v; date_str = d; pnp_id = pid;
             }
        } else if let Ok(gpu) = serde_json::from_str::<GpuInfoRaw>(&output_str) {
             let (n, m, v, d, pid) = extract_data(&gpu);
             name = n; memory = m; version = v; date_str = d; pnp_id = pid;
        }
    }

    if !pnp_id.is_empty() {
        let escaped_id = pnp_id.replace("\\", "\\\\");
        let loc_output = Command::new("powershell")
            .args([
                "-NoProfile", 
                "-Command", 
                &format!(
                    "Get-CimInstance Win32_PnPEntity -Filter \"DeviceID='{}'\" | Select-Object -ExpandProperty Location", 
                    escaped_id
                )
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
            
        if let Ok(l_out) = loc_output {
             let l_str = String::from_utf8_lossy(&l_out.stdout).trim().to_string();
             if !l_str.is_empty() {
                 location = l_str;
             }
        }
    }
    
    let info = (name, memory, version, date_str, location);
    *cache = Some(info.clone());
    info
}

fn get_memory_config(state: &State<'_, AppState>, total_memory: u64, used_memory: u64) -> MemoryConfigInfo {
    let mut cache = state.memory_info_cache.lock().unwrap();
    if let Some(info) = cache.as_ref() {
        let mut info = info.clone();
        return info;
    }

    use std::process::Command;
    use std::os::windows::process::CommandExt;
    
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let output = Command::new("powershell")
        .args([
            "-NoProfile", 
            "-Command", 
            "Get-CimInstance Win32_PhysicalMemory | Select-Object Speed, FormFactor, Capacity | ConvertTo-Json -Compress"
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    
    let mut speed_mhz = 0u32;
    let mut slots_used = 0u32;
    let mut form_factor = "Unknown".to_string();
    let mut total_installed: u64 = 0;

    if let Ok(output) = output {
        let output_str = String::from_utf8_lossy(&output.stdout);
        
        #[derive(serde::Deserialize)]
        struct MemModule {
            Speed: Option<u32>,
            FormFactor: Option<u32>,
            Capacity: Option<u64>,
        }

        fn form_factor_to_string(ff: u32) -> String {
            match ff {
                0 => "Unknown".to_string(),
                1 => "Other".to_string(),
                2 => "SIP".to_string(),
                3 => "DIP".to_string(),
                4 => "ZIP".to_string(),
                5 => "SOJ".to_string(),
                6 => "Proprietary".to_string(),
                7 => "SIMM".to_string(),
                8 => "DIMM".to_string(),
                9 => "TSOP".to_string(),
                10 => "PGA".to_string(),
                11 => "RIMM".to_string(),
                12 => "SODIMM".to_string(),
                13 => "SRIMM".to_string(),
                14 => "SMD".to_string(),
                15 => "SSMP".to_string(),
                16 => "QFP".to_string(),
                17 => "TQFP".to_string(),
                18 => "SOIC".to_string(),
                19 => "LCC".to_string(),
                20 => "PLCC".to_string(),
                21 => "BGA".to_string(),
                22 => "FPBGA".to_string(),
                23 => "LGA".to_string(),
                _ => "Unknown".to_string(),
            }
        }

        if let Ok(modules) = serde_json::from_str::<Vec<MemModule>>(&output_str) {
            slots_used = modules.len() as u32;
            for module in &modules {
                if let Some(spd) = module.Speed {
                    if spd > speed_mhz {
                        speed_mhz = spd;
                    }
                }
                if let Some(ff) = module.FormFactor {
                    if form_factor == "Unknown" || form_factor == "Other" {
                        form_factor = form_factor_to_string(ff);
                    }
                }
                if let Some(cap) = module.Capacity {
                    total_installed += cap;
                }
            }
        } else if let Ok(module) = serde_json::from_str::<MemModule>(&output_str) {
            slots_used = 1;
            if let Some(spd) = module.Speed {
                speed_mhz = spd;
            }
            if let Some(ff) = module.FormFactor {
                form_factor = form_factor_to_string(ff);
            }
            if let Some(cap) = module.Capacity {
                total_installed = cap;
            }
        }
    }

    let slots_output = Command::new("powershell")
        .args([
            "-NoProfile", 
            "-Command", 
            "Get-CimInstance Win32_PhysicalMemoryArray | Select-Object MemoryDevices | ConvertTo-Json -Compress"
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    
    let mut slots_total = slots_used;

    if let Ok(output) = slots_output {
        let output_str = String::from_utf8_lossy(&output.stdout);
        
        #[derive(serde::Deserialize)]
        struct MemArray {
            MemoryDevices: Option<u32>,
        }

        if let Ok(arr) = serde_json::from_str::<MemArray>(&output_str) {
            if let Some(devices) = arr.MemoryDevices {
                slots_total = devices;
            }
        } else if let Ok(arrays) = serde_json::from_str::<Vec<MemArray>>(&output_str) {
            for arr in arrays {
                if let Some(devices) = arr.MemoryDevices {
                    slots_total = devices;
                    break;
                }
            }
        }
    }

    let hardware_reserved = if total_installed > total_memory {
        total_installed - total_memory
    } else {
        0
    };

    let info = MemoryConfigInfo {
        speed_mhz,
        slots_used,
        slots_total,
        form_factor,
        hardware_reserved,
    };
    *cache = Some(info.clone());
    info
}

#[tauri::command]
fn kill_process(state: State<'_, AppState>, pid: u32) -> bool {
    let sys = state.sys.lock().unwrap();
    if let Some(process) = sys.processes().get(&Pid::from_u32(pid)) {
        return process.kill();
    }
    false
}

#[derive(serde::Serialize)]
struct AppHistoryInfo {
    name: String,
    cpu_time_ms: u64,
    network_bytes: u64,
    disk_bytes: u64,
    icon: Option<String>,
}

#[tauri::command]
fn get_app_history(state: State<'_, AppState>) -> Vec<AppHistoryInfo> {
    let history = state.app_history.lock().unwrap();
    let mut result: Vec<AppHistoryInfo> = history
        .iter()
        .map(|(name, entry)| AppHistoryInfo {
            name: name.clone(),
            cpu_time_ms: entry.cpu_time_ms,
            network_bytes: entry.network_bytes,
            disk_bytes: entry.disk_bytes,
            icon: entry.icon.clone(),
        })
        .collect();
    
    result.sort_by(|a, b| b.cpu_time_ms.cmp(&a.cpu_time_ms));
    result
}

#[tauri::command]
fn clear_app_history(state: State<'_, AppState>) {
    let mut history = state.app_history.lock().unwrap();
    history.clear();
}

#[derive(serde::Serialize, Clone)]
struct UserSessionInfo {
    username: String,
    domain: String,
    session_id: u32,
    status: String,
    cpu_usage: f32,
    memory_bytes: u64,
    process_count: u32,
    processes: Vec<ProcessInfo>,
}

#[tauri::command]
fn get_user_sessions(state: State<'_, AppState>) -> Vec<UserSessionInfo> {
    use std::process::Command;
    use std::collections::HashMap;
    
    let mut users: HashMap<String, UserSessionInfo> = HashMap::new();
    let current_user = std::env::var("USERNAME").unwrap_or_default().to_lowercase();
    let domain = std::env::var("USERDOMAIN").unwrap_or_else(|_| "LOCAL".to_string());
    
    let output = Command::new("query")
        .args(["user"])
        .output();
    
    if let Ok(output) = output {
        let output_str = String::from_utf8_lossy(&output.stdout);
        for line in output_str.lines().skip(1) {
            let is_current_line = line.starts_with('>') || line.starts_with(" >");
            let clean_line = line.trim_start_matches('>').trim_start_matches(' ');
            let parts: Vec<&str> = clean_line.split_whitespace().collect();
            
            if !parts.is_empty() {
                let username = parts[0].to_string();
                
                let session_id: u32 = parts.iter()
                    .find_map(|s| s.parse().ok())
                    .unwrap_or(1);
                
                let line_upper = line.to_uppercase();
                let is_active = is_current_line 
                    || line_upper.contains("ACTIVE") 
                    || line_upper.contains("ATIVO")
                    || username.to_lowercase() == current_user;
                
                let username_key = username.to_lowercase();
                users.insert(username_key, UserSessionInfo {
                    username: username.clone(),
                    domain: domain.clone(),
                    session_id,
                    status: if is_active { "Active".to_string() } else { "Disconnected".to_string() },
                    cpu_usage: 0.0,
                    memory_bytes: 0,
                    process_count: 0,
                    processes: Vec::new(),
                });
            }
        }
    }
    
    if users.is_empty() {
        if let Ok(username) = std::env::var("USERNAME") {
            let username_key = username.to_lowercase();
            users.insert(username_key, UserSessionInfo {
                username: username.clone(),
                domain,
                session_id: 1,
                status: "Active".to_string(),
                cpu_usage: 0.0,
                memory_bytes: 0,
                process_count: 0,
                processes: Vec::new(),
            });
        }
    }
    
    let mut sys = state.sys.lock().unwrap();
    sys.refresh_all();
    let num_cores = sys.cpus().len() as f32;
    let app_pids = get_app_pids();
    let mut icon_cache = state.icon_cache.lock().unwrap();

    for (pid, process) in sys.processes() {
        if let Some(user) = users.get_mut(&current_user) {
            let cpu = if num_cores > 0.0 {
                process.cpu_usage() / num_cores
            } else {
                process.cpu_usage()
            };
            
            let is_app = app_pids.contains(&pid.as_u32());
            let mut icon = None;
            if is_app {
                if let Some(exe_path) = process.exe() {
                    let path_str = exe_path.to_string_lossy().into_owned();
                    if let Some(cached) = icon_cache.get(&path_str) {
                        icon = Some(cached.clone());
                    } else if let Some(extracted) = extract_icon_base64(&path_str) {
                        icon = Some(extracted.clone());
                        icon_cache.insert(path_str, extracted);
                    }
                }
            }

            user.cpu_usage += cpu;
            user.memory_bytes += process.memory();
            user.process_count += 1;
            user.processes.push(ProcessInfo {
                pid: pid.as_u32(),
                name: process.name().to_string_lossy().into_owned(),
                cpu_usage: cpu,
                memory: process.memory(),
                disk_usage: 0,
                network_usage: 0,
                gpu_usage: 0.0,
                is_app,
                icon,
            });
        }
    }
    
    for user in users.values_mut() {
        user.processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));
    }
    
    users.into_values().collect()
}


#[derive(serde::Serialize)]
struct StartupApp {
    name: String,
    path: String,
    publisher: String,
    enabled: bool,
    location: String,
    icon: Option<String>,
}

#[derive(serde::Serialize)]
struct StartupData {
    apps: Vec<StartupApp>,
    last_bios_time: u64,
}

#[tauri::command]
async fn get_startup_apps(state: State<'_, AppState>) -> Result<StartupData, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    use std::process::Command;
    use std::os::windows::process::CommandExt;
    use std::collections::{HashSet, HashMap};

    let mut raw_apps: Vec<(String, String, String)> = Vec::new();
    
    if let Ok(hkcu) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") {
        for (name, _) in hkcu.enum_values().filter_map(|x| x.ok()) {
            if let Ok(path) = hkcu.get_value::<String, _>(&name) {
                raw_apps.push((name, path, "HKCU".to_string()));
            }
        }
    }
    
    if let Ok(hklm) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run") {
        for (name, _) in hklm.enum_values().filter_map(|x| x.ok()) {
            if let Ok(path) = hklm.get_value::<String, _>(&name) {
                 if !raw_apps.iter().any(|(n, _, _)| n == &name) {
                    raw_apps.push((name, path, "HKLM".to_string()));
                }
            }
        }
    }

    let mut apps: Vec<StartupApp> = Vec::new();
    let mut paths_to_query: Vec<String> = Vec::new();
    let mut icon_cache = state.icon_cache.lock().unwrap();

    fn local_clean_path(p: &str) -> String {
        let p = p.trim();
        if p.starts_with('"') {
             if let Some(end) = p[1..].find('"') {
                 return p[1..end+1].to_string();
             }
        }
        if let Some(pos) = p.to_lowercase().find(".exe") {
             let end = pos + 4;
             if end >= p.len() || p.as_bytes()[end] == b' ' || p.as_bytes()[end] == b'"' {
                 return p[..end].to_string();
             }
        }
        p.trim_matches('"').to_string()
    }

    for (name, raw_path, location) in raw_apps {
        let clean_path = local_clean_path(&raw_path);
        
        let mut enabled = true;
        if location == "HKCU" {
             if let Ok(approved) = RegKey::predef(HKEY_CURRENT_USER)
                .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run")
            {
                if let Ok(value) = approved.get_raw_value(&name) {
                     if !value.bytes.is_empty() {
                         let b = value.bytes[0];
                         if b != 0x02 && b != 0x06 {
                             enabled = false;
                         }
                     }
                }
            }
        }

        let icon = get_cached_icon(&clean_path, &mut icon_cache);
        if !clean_path.is_empty() && !clean_path.contains("System32") {
            paths_to_query.push(clean_path.clone());
        }

        apps.push(StartupApp {
            name,
            path: clean_path,
            publisher: "Unknown".to_string(),
            enabled,
            location,
            icon,
        });
    }

    if !paths_to_query.is_empty() {
        let unique_paths: HashSet<_> = paths_to_query.iter().cloned().collect();
        let unique_paths_vec: Vec<String> = unique_paths.into_iter().collect();
        
        if let Ok(json_paths) = serde_json::to_string(&unique_paths_vec) {
             let ps_json = json_paths.replace("'", "''");
             
             let ps_script = format!(
                "$paths = ConvertFrom-Json '{}'; \
                 $res = @{{}}; \
                 foreach($p in $paths) {{ \
                    try {{ \
                        $item = Get-Item -LiteralPath $p -ErrorAction Stop; \
                        $pub = $item.VersionInfo.CompanyName; \
                        if ($pub) {{ $res[$p] = $pub }} \
                    }} catch {{}} \
                 }}; \
                 $res | ConvertTo-Json -Compress",
                 ps_json
            );

            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let output = Command::new("powershell")
                .args(["-NoProfile", "-Command", &ps_script])
                .creation_flags(CREATE_NO_WINDOW)
                .output();

            if let Ok(out) = output {
                 let s = String::from_utf8_lossy(&out.stdout);
                 if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&s) {
                     for app in &mut apps {
                         if let Some(publ) = map.get(&app.path) {
                             if !publ.is_empty() {
                                 app.publisher = publ.clone();
                             }
                         }
                     }
                 }
            }
        }
    }
    
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let mut last_bios_time = 0;
    if let Ok(k) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey("SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power") {
        if let Ok(t) = k.get_value::<u32, _>("FwPOSTTime") {
            last_bios_time = t as u64;
        }
    }

    Ok(StartupData {
        apps,
        last_bios_time
    })
}

fn get_cached_icon(path: &str, cache: &mut HashMap<String, String>) -> Option<String> {
    if let Some(cached) = cache.get(path) {
        return Some(cached.clone());
    }
    
    if let Some(icon) = extract_icon_base64(path) {
        cache.insert(path.to_string(), icon.clone());
        return Some(icon);
    }
    
    None
}

#[tauri::command]
fn toggle_startup_app(name: String, enabled: bool) -> bool {
    use winreg::enums::*;
    use winreg::RegKey;
    
    if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run",
            KEY_READ | KEY_WRITE
        )
    {
        let value: Vec<u8> = if enabled {
            vec![0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
        } else {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let mut bytes = vec![0x03, 0x00, 0x00, 0x00];
            bytes.extend_from_slice(&(now as u64).to_le_bytes());
            bytes
        };
        
        if key.set_raw_value(&name, &winreg::RegValue { vtype: winreg::enums::REG_BINARY, bytes: value }).is_ok() {
            return true;
        }
    }
    
    false
}

#[tauri::command]
fn set_auto_start(enabled: bool) -> bool {
    use winreg::enums::*;
    use winreg::RegKey;
    use std::env;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    
    if let Ok(key) = hkcu.open_subkey_with_flags(path, KEY_SET_VALUE) {
        if enabled {
            if let Ok(exe_path) = env::current_exe() {
                let exe_path_str = exe_path.to_string_lossy().to_string();
                let value = format!("\"{}\"", exe_path_str);
                return key.set_value("TaskManager", &value).is_ok();
            }
        } else {
            let _ = key.delete_value("TaskManager");
            return true;
        }
    }
    false
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct ServiceInfo {
    name: String,
    pid: Option<u32>,
    description: String,
    status: String,
}

#[tauri::command]
fn get_services() -> Vec<ServiceInfo> {
    use std::process::Command;
    
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            r#"Get-CimInstance -ClassName Win32_Service | Select-Object @{N='name';E={$_.Name}}, @{N='pid';E={$_.ProcessId}}, @{N='description';E={$_.DisplayName}}, @{N='status';E={$_.State}} | ConvertTo-Json -Compress"#
        ])
        .output();
    
    if let Ok(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if let Ok(services) = serde_json::from_str::<Vec<ServiceInfo>>(&stdout) {
            return services;
        } else if let Ok(service) = serde_json::from_str::<ServiceInfo>(&stdout) {
            return vec![service];
        }
    }
    
    Vec::new()
}


#[tauri::command]
fn manage_service(name: String, action: String) -> bool {
    use std::process::Command;
    
    let _cmd = match action.as_str() {
        "start" => "start",
        "stop" => "stop",
        "restart" => "restart",
        _ => return false,
    };
    
    let shell_cmd = match action.as_str() {
        "restart" => format!("Restart-Service -Name '{}' -Force", name),
        "open_msc" => "services.msc".to_string(),
        _ => format!("{}-Service -Name '{}' -Force", action.to_uppercase(), name),
    };

    let output = if action == "open_msc" {
        Command::new("cmd")
            .args(["/c", "start", "services.msc"])
            .output()
    } else {
        Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &shell_cmd
            ])
            .output()
    };
    
    output.is_ok() && output.unwrap().status.success()
}

use tauri::Manager;
#[cfg(target_os = "windows")]
use window_vibrancy::apply_acrylic;
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[tauri::command]
fn set_always_on_top(window: tauri::Window, on_top: bool) -> bool {
    window.set_always_on_top(on_top).is_ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            #[cfg(target_os = "macos")]
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None).ok();
            #[cfg(target_os = "windows")]
            apply_acrylic(&window, Some((21, 24, 30, 128))).ok();
            Ok(())
        })
        .manage(AppState {
            sys: Mutex::new(System::new_all()),
            networks: Mutex::new(Networks::new_with_refreshed_list()),
            gpu_monitor: Mutex::new(GpuMonitor::new()),
            network_monitor: Mutex::new(NetworkMonitor::new()),
            system_metrics_monitor: Mutex::new(SystemMetricsMonitor::new()),
            icon_cache: Mutex::new(HashMap::new()),
            app_history: Mutex::new(HashMap::new()),
            gpu_info_cache: Mutex::new(None),
            memory_info_cache: Mutex::new(None),
            last_update: Mutex::new(std::time::Instant::now()),
        })
        .invoke_handler(tauri::generate_handler![
            get_processes, 
            kill_process, 
            get_startup_apps, 
            toggle_startup_app, 
            get_app_history, 
            clear_app_history, 
            get_user_sessions,
            get_services,
            manage_service,
            set_always_on_top,
            set_auto_start
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
