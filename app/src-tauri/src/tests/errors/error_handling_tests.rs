use super::common::setup_db;
use std::fs::{self, File};
use std::os::unix::fs::PermissionsExt;

#[test]
fn test_write_settings_to_readonly_dir_errors() {
    let dir = tempfile::tempdir().unwrap();
    let dir_path = dir.path().to_path_buf();

    // Make directory read-only
    let mut perms = fs::metadata(&dir_path).unwrap().permissions();
    perms.set_mode(0o444);
    fs::set_permissions(&dir_path, perms).unwrap();

    let s = crate::AppSettings {
        db_path: Some("/tmp/some/path.db".to_string()),
    };
    let res = crate::write_settings_to_dir(&dir_path, &s);

    // Should fail to write due to permissions
    assert!(res.is_err());

    // restore permissions so tempdir can be removed
    let mut perms_ok = fs::metadata(&dir_path).unwrap().permissions();
    perms_ok.set_mode(0o755);
    fs::set_permissions(&dir_path, perms_ok).unwrap();
}

#[test]
fn test_set_db_path_parent_creation_permission_error() {
    // Setup XDG_DATA_HOME to temp dir and an unwritable subdir
    let dir = tempfile::tempdir().unwrap();
    std::env::set_var("XDG_DATA_HOME", dir.path());

    let readonly = dir.path().join("readonly");
    fs::create_dir(&readonly).unwrap();

    // Remove write permission from readonly dir
    let mut perms = fs::metadata(&readonly).unwrap().permissions();
    perms.set_mode(0o555); // read and exec only
    fs::set_permissions(&readonly, perms).unwrap();

    // Attempting to set db path under readonly/child/test.db should trigger parent creation and fail; simulate via helpers
    let target = readonly.join("child").join("test.db");
    let dir_path = dir.path().to_path_buf();
    // Write settings that point to target and then initializing DB at target should fail due to readonly parent
    crate::write_settings_to_dir(
        &dir_path,
        &crate::AppSettings {
            db_path: Some(target.to_string_lossy().to_string()),
        },
    )
    .unwrap();
    let res = crate::init_db_at_path(&target);
    assert!(res.is_err());

    // Restore permissions
    let mut perms_ok = fs::metadata(&readonly).unwrap().permissions();
    perms_ok.set_mode(0o755);
    fs::set_permissions(&readonly, perms_ok).unwrap();
    std::env::remove_var("XDG_DATA_HOME");
}

#[test]
fn test_db_locked_write_fails() {
    let (_dir, db_path) = setup_db();

    // Open an exclusive transaction to lock DB for writes
    let conn = rusqlite::Connection::open(&db_path).unwrap();
    conn.execute_batch("BEGIN EXCLUSIVE;").unwrap();

    // Attempts to create a new account should fail because DB is locked
    let res = crate::create_account_db(&db_path, "LockTest".to_string(), 10.0, None);
    assert!(res.is_err());

    // End exclusive to unlock
    conn.execute_batch("ROLLBACK;").unwrap();
}

#[test]
fn test_read_settings_unreadable_file_errors() {
    let dir = tempfile::tempdir().unwrap();
    let dir_path = dir.path().to_path_buf();

    let settings_path = dir_path.join("settings.json");
    File::create(&settings_path).unwrap();

    // Remove read permission from file
    let mut perms = fs::metadata(&settings_path).unwrap().permissions();
    perms.set_mode(0o000);
    fs::set_permissions(&settings_path, perms).unwrap();

    let res = crate::read_settings_from_dir(&dir_path);
    assert!(res.is_err());

    // restore permissions so tempdir can be removed
    let mut perms_ok = fs::metadata(&settings_path).unwrap().permissions();
    perms_ok.set_mode(0o644);
    fs::set_permissions(&settings_path, perms_ok).unwrap();
}
