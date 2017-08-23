# --- !Ups
INSERT INTO role (role_id, role) VALUES (4, 'Turker');

ALTER TABLE amt_assignment
  ADD turker_id TEXT NOT NULL;

# --- !Downs

ALTER TABLE amt_assignment
  DROP turker_id;

DELETE FROM role WHERE (role_id = 4 AND role = 'Turker');
DELETE FROM user_role WHERE role_id = 4;