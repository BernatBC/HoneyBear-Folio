use tempfile::tempdir;
use std::path::Path;

#[test]
fn test_app_handle_db_path_set_and_reset() {
    // Ensure XDG_DATA_HOME points to a temp dir so AppHandle.app_data_dir returns a testable location
    let dir = tempdir().unwrap();
    std::env::set_var("XDG_DATA_HOME", dir.path());

    // Build a minimal Tauri app to obtain an AppHandle
    let context = tauri::generate_context!();
    let app = tauri::Builder::default().build(context).unwrap();
    let handle = app.handle();

    // Default DB path should be under our temp XDG_DATA_HOME
    let default_path = crate::get_db_path(&handle).unwrap();
    assert!(default_path.ends_with("honeybear.db"));
    assert!(default_path.starts_with(dir.path()));

    // set_db_path should write settings and create the parent directory
    let nested = dir.path().join("nested").join("test.db");
    let nested_str = nested.to_string_lossy().to_string();
    crate::set_db_path(handle.clone(), nested_str.clone()).unwrap();

    // Ensure settings reflect override
    let settings = crate::read_settings(&handle).unwrap();
    assert_eq!(settings.db_path.as_deref(), Some(nested_str.as_str()));

    // The DB should have been initialized at nested path
    assert!(Path::new(&nested_str).exists());

    // reset should clear override and recreate default DB at XDG_DATA_HOME
    crate::reset_db_path(handle.clone()).unwrap();
    let settings2 = crate::read_settings(&handle).unwrap();
    assert!(settings2.db_path.is_none());

    let default2 = crate::get_db_path(&handle).unwrap();
    assert!(default2.ends_with("honeybear.db"));
    assert!(default2.starts_with(dir.path()));

    // Cleanup env var
    std::env::remove_var("XDG_DATA_HOME");
}
