SET
search_path TO dental_clinic, public;

INSERT INTO employees (last_name,
                       first_name,
                       middle_name,
                       position,
                       phone,
                       email)
SELECT 'Иванов',
       'Алексей',
       'Петрович',
       'Администратор системы',
       '+79000000001',
       'admin@example.com' WHERE NOT EXISTS (
    SELECT 1
    FROM employees
    WHERE email = 'admin@example.com'
);

INSERT INTO employees (last_name,
                       first_name,
                       middle_name,
                       position,
                       phone,
                       email)
SELECT 'Смирнова',
       'Ольга',
       'Игоревна',
       'Сотрудник регистратуры',
       '+79000000002',
       'registrar@example.com' WHERE NOT EXISTS (
    SELECT 1
    FROM employees
    WHERE email = 'registrar@example.com'
);

INSERT INTO employees (last_name,
                       first_name,
                       middle_name,
                       position,
                       phone,
                       email)
SELECT 'Петров',
       'Дмитрий',
       'Сергеевич',
       'Врач-стоматолог',
       '+79000000003',
       'doctor@example.com' WHERE NOT EXISTS (
    SELECT 1
    FROM employees
    WHERE email = 'doctor@example.com'
);

INSERT INTO patients (last_name,
                      first_name,
                      middle_name,
                      birth_date,
                      phone,
                      email,
                      address)
SELECT 'Соколов',
       'Никита',
       'Андреевич',
       '2003-05-15',
       '+79000000004',
       'patient@example.com',
       'г. Нижний Новгород' WHERE NOT EXISTS (
    SELECT 1
    FROM patients
    WHERE email = 'patient@example.com'
);

INSERT INTO users (login,
                   password_hash,
                   role_id,
                   employee_id)
VALUES ('admin',
        '$2a$10$7EqJtq98hPqEX7fNZaFWoOHiKMkQf49sIa/Q4Dkf6P24hS..siL1O',
        (SELECT id
         FROM roles
         WHERE name = 'admin'
            LIMIT 1),
       (
           SELECT id
           FROM employees
           WHERE email = 'admin@example.com'
           ORDER BY id
           LIMIT 1) ),
    (
        'registrar',
        '$2a$10$7EqJtq98hPqEX7fNZaFWoOHiKMkQf49sIa/Q4Dkf6P24hS..siL1O',
        (
            SELECT id
            FROM roles
            WHERE name = 'registrar'
            LIMIT 1
        ),
        (
            SELECT id
            FROM employees
            WHERE email = 'registrar@example.com'
            ORDER BY id
            LIMIT 1
        )
    ),
    (
        'doctor',
        '$2a$10$7EqJtq98hPqEX7fNZaFWoOHiKMkQf49sIa/Q4Dkf6P24hS..siL1O',
        (
            SELECT id
            FROM roles
            WHERE name = 'doctor'
            LIMIT 1
        ),
        (
            SELECT id
            FROM employees
            WHERE email = 'doctor@example.com'
            ORDER BY id
            LIMIT 1
        )
    )
ON CONFLICT (login) DO NOTHING;

INSERT INTO users (login,
                   password_hash,
                   role_id,
                   patient_id)
VALUES ('patient',
        '$2a$10$7EqJtq98hPqEX7fNZaFWoOHiKMkQf49sIa/Q4Dkf6P24hS..siL1O',
        (SELECT id
         FROM roles
         WHERE name = 'patient'
            LIMIT 1),
       (
           SELECT id
           FROM patients
           WHERE email = 'patient@example.com'
           ORDER BY id
           LIMIT 1)
    )
ON CONFLICT (login) DO NOTHING;