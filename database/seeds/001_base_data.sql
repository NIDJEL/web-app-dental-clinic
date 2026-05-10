SET
search_path TO dental_clinic, public;

INSERT INTO roles (name,
                   description)
VALUES ('admin',
        'Администратор системы'),
       ('registrar',
        'Сотрудник регистратуры'),
       ('doctor',
        'Врач-стоматолог'),
       ('patient',
        'Пациент') ON CONFLICT (name) DO NOTHING;

INSERT INTO rooms (name,
                   floor,
                   description)
VALUES ('Кабинет №1',
        1,
        'Основной стоматологический кабинет'),
       ('Кабинет №2',
        1,
        'Кабинет терапевтического приема'),
       ('Кабинет №3',
        1,
        'Кабинет хирургического приема') ON CONFLICT (name) DO NOTHING;

INSERT INTO services (name,
                      description,
                      price,
                      duration_minutes)
SELECT 'Первичный осмотр',
       'Консультация и осмотр пациента',
       1000.00,
       30 WHERE NOT EXISTS (
    SELECT 1
    FROM services
    WHERE name = 'Первичный осмотр'
);

INSERT INTO services (name,
                      description,
                      price,
                      duration_minutes)
SELECT 'Лечение кариеса',
       'Терапевтическое лечение кариеса',
       3500.00,
       60 WHERE NOT EXISTS (
    SELECT 1
    FROM services
    WHERE name = 'Лечение кариеса'
);

INSERT INTO services (name,
                      description,
                      price,
                      duration_minutes)
SELECT 'Профессиональная чистка',
       'Гигиеническая чистка зубов',
       3000.00,
       60 WHERE NOT EXISTS (
    SELECT 1
    FROM services
    WHERE name = 'Профессиональная чистка'
);

INSERT INTO services (name,
                      description,
                      price,
                      duration_minutes)
SELECT 'Удаление зуба',
       'Хирургическое удаление зуба',
       4000.00,
       45 WHERE NOT EXISTS (
    SELECT 1
    FROM services
    WHERE name = 'Удаление зуба'
);

INSERT INTO services (name,
                      description,
                      price,
                      duration_minutes)
SELECT 'Рентген-снимок',
       'Диагностический рентген-снимок',
       800.00,
       15 WHERE NOT EXISTS (
    SELECT 1
    FROM services
    WHERE name = 'Рентген-снимок'
);