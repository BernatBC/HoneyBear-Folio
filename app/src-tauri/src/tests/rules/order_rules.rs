use crate::tests::common::setup_db;
use crate::{create_rule_db, get_rules_db, update_rules_order_db};

#[test]
fn test_reorder_rules() {
    let (_dir, db_path) = setup_db();

    // Create 3 rules
    // Initial priorities don't matter much as we will override them
    let id1 = create_rule_db(&db_path, 0, "f".to_string(), "p".to_string(), "a".to_string(), "v".to_string()).unwrap();
    let id2 = create_rule_db(&db_path, 0, "f".to_string(), "p".to_string(), "a".to_string(), "v".to_string()).unwrap();
    let id3 = create_rule_db(&db_path, 0, "f".to_string(), "p".to_string(), "a".to_string(), "v".to_string()).unwrap();

    // New order: 2, 3, 1 (Top to Bottom)
    // Expectation: 2 gets highest priority, 1 gets lowest.
    let new_order = vec![id2, id3, id1];

    update_rules_order_db(&db_path, new_order).unwrap();

    let rules = get_rules_db(&db_path).unwrap();
    
    // get_rules returns ordered by priority DESC.
    // So the list should be [id2, id3, id1]
    
    assert_eq!(rules.len(), 3);
    assert_eq!(rules[0].id, id2);
    assert_eq!(rules[1].id, id3);
    assert_eq!(rules[2].id, id1);

    // Verify raw priorities: 
    // Total = 3.
    // idx 0 (id2) -> priority 3
    // idx 1 (id3) -> priority 2
    // idx 2 (id1) -> priority 1
    assert_eq!(rules[0].priority, 3);
    assert_eq!(rules[1].priority, 2);
    assert_eq!(rules[2].priority, 1);
}
