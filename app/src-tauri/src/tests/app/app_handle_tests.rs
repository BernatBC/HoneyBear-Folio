use tempfile::tempdir;
use std::path::Path;

#[test]
fn test_app_handle_db_path_set_and_reset() {
    // Ensure XDG_DATA_HOME points to a temp dir so helper functions operate on a testable location
    let dir = tempdir().unwrap();
    std::env::set_var("XDG_DATA_HOME", dir.path());
    let dir_path = dir.path().to_path_buf();

    // Default DB path should be under our temp XDG_DATA_HOME
    let default_path = crate::get_db_path_for_dir(&dir_path).unwrap();
    assert!(default_path.ends_with("honeybear.db"));
    assert!(default_path.starts_with(dir.path()));

    // set_db_path should write settings and create the parent directory; simulate via helpers
    let nested = dir_path.join("nested").join("test.db");
    let nested_str = nested.to_string_lossy().to_string();
    crate::write_settings_to_dir(&dir_path, &crate::AppSettings { db_path: Some(nested_str.clone()) }).unwrap();
    crate::init_db_at_path(&nested).unwrap();

    // Ensure settings reflect override
    let settings = crate::read_settings_from_dir(&dir_path).unwrap();
    assert_eq!(settings.db_path.as_deref(), Some(nested_str.as_str()));

    // The DB should have been initialized at nested path
    assert!(Path::new(&nested_str).exists());

    // reset should clear override and recreate default DB at XDG_DATA_HOME
    crate::write_settings_to_dir(&dir_path, &crate::AppSettings::default()).unwrap();
    let default2 = crate::get_db_path_for_dir(&dir_path).unwrap();
    crate::init_db_at_path(&default2).unwrap();

    let settings2 = crate::read_settings_from_dir(&dir_path).unwrap();
    assert!(settings2.db_path.is_none());

    let default2 = crate::get_db_path_for_dir(&dir_path).unwrap();
    assert!(default2.ends_with("honeybear.db"));
    assert!(default2.starts_with(dir.path()));

    // Cleanup env var
    std::env::remove_var("XDG_DATA_HOME");
}
