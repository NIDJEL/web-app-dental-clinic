CREATE SCHEMA IF NOT EXISTS dental_clinic;

SET
search_path TO dental_clinic, public;

CREATE
OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at
= NOW();
RETURN NEW;
END;
$$
LANGUAGE plpgsql;

CREATE TABLE roles
(
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE employees
(
    id          BIGSERIAL PRIMARY KEY,
    last_name   VARCHAR(100) NOT NULL,
    first_name  VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    position    VARCHAR(100) NOT NULL,
    phone       VARCHAR(30),
    email       VARCHAR(150),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE patients
(
    id            BIGSERIAL PRIMARY KEY,
    last_name     VARCHAR(100) NOT NULL,
    first_name    VARCHAR(100) NOT NULL,
    middle_name   VARCHAR(100),
    birth_date    DATE,
    phone         VARCHAR(30)  NOT NULL,
    email         VARCHAR(150),
    address       TEXT,
    medical_notes TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE users
(
    id            BIGSERIAL PRIMARY KEY,
    login         VARCHAR(100)  NOT NULL UNIQUE,
    password_hash TEXT          NOT NULL,
    role_id       BIGINT        NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
    employee_id   BIGINT UNIQUE REFERENCES employees (id) ON DELETE SET NULL,
    patient_id    BIGINT UNIQUE REFERENCES patients (id) ON DELETE SET NULL,
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT users_only_one_profile CHECK (
        NOT (
            employee_id IS NOT NULL
                AND patient_id IS NOT NULL
            )
        )
);

CREATE TABLE rooms
(
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    floor       INTEGER,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE services
(
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(150)   NOT NULL UNIQUE,
    description      TEXT,
    price            NUMERIC(10, 2) NOT NULL,
    duration_minutes INTEGER        NOT NULL,
    is_active        BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT services_price_check CHECK (price > 0),
    CONSTRAINT services_duration_check CHECK (duration_minutes > 0)
);

CREATE TABLE doctor_schedules
(
    id           BIGSERIAL PRIMARY KEY,
    doctor_id    BIGINT      NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    room_id      BIGINT      REFERENCES rooms (id) ON DELETE SET NULL,
    work_date    DATE        NOT NULL,
    start_time   TIME        NOT NULL,
    end_time     TIME        NOT NULL,
    is_available BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT doctor_schedules_time_check CHECK (start_time < end_time),
    CONSTRAINT doctor_schedules_unique UNIQUE (
                                               doctor_id,
                                               work_date,
                                               start_time,
                                               end_time
        )
);

CREATE TABLE appointments
(
    id                 BIGSERIAL PRIMARY KEY,
    patient_id         BIGINT      NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    doctor_id          BIGINT      NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
    room_id            BIGINT      REFERENCES rooms (id) ON DELETE SET NULL,
    service_id         BIGINT      REFERENCES services (id) ON DELETE SET NULL,
    appointment_start  TIMESTAMPTZ NOT NULL,
    appointment_end    TIMESTAMPTZ NOT NULL,
    status             VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    comment            TEXT,
    created_by_user_id BIGINT      REFERENCES users (id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT appointments_time_check CHECK (appointment_start < appointment_end),
    CONSTRAINT appointments_status_check CHECK (
        status IN (
                   'scheduled',
                   'completed',
                   'cancelled',
                   'moved'
            )
        )
);

CREATE TABLE visits
(
    id             BIGSERIAL PRIMARY KEY,
    appointment_id BIGINT      NOT NULL UNIQUE REFERENCES appointments (id) ON DELETE CASCADE,
    doctor_id      BIGINT      NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
    patient_id     BIGINT      NOT NULL REFERENCES patients (id) ON DELETE CASCADE,
    visit_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    diagnosis      TEXT,
    result         TEXT,
    doctor_comment TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE visit_services
(
    id            BIGSERIAL PRIMARY KEY,
    visit_id      BIGINT         NOT NULL REFERENCES visits (id) ON DELETE CASCADE,
    service_id    BIGINT         NOT NULL REFERENCES services (id) ON DELETE RESTRICT,
    quantity      INTEGER        NOT NULL DEFAULT 1,
    price_at_time NUMERIC(10, 2) NOT NULL,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT visit_services_quantity_check CHECK (quantity > 0),
    CONSTRAINT visit_services_price_check CHECK (price_at_time > 0),
    CONSTRAINT visit_services_unique UNIQUE (
                                             visit_id,
                                             service_id
        )
);

CREATE TABLE payments
(
    id             BIGSERIAL PRIMARY KEY,
    visit_id       BIGINT         NOT NULL REFERENCES visits (id) ON DELETE CASCADE,
    amount         NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50)    NOT NULL,
    status         VARCHAR(30)    NOT NULL DEFAULT 'paid',
    payment_date   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT payments_amount_check CHECK (amount > 0),
    CONSTRAINT payments_method_check CHECK (
        payment_method IN (
                           'cash',
                           'card',
                           'online'
            )
        ),
    CONSTRAINT payments_status_check CHECK (
        status IN (
                   'paid',
                   'cancelled',
                   'refunded'
            )
        )
);

CREATE TABLE notifications
(
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT REFERENCES users (id) ON DELETE CASCADE,
    patient_id     BIGINT REFERENCES patients (id) ON DELETE CASCADE,
    appointment_id BIGINT REFERENCES appointments (id) ON DELETE CASCADE,
    type           VARCHAR(50)  NOT NULL,
    title          VARCHAR(200) NOT NULL,
    message        TEXT         NOT NULL,
    is_read        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    sent_at        TIMESTAMPTZ,

    CONSTRAINT notifications_type_check CHECK (
        type IN (
                 'appointment_created',
                 'appointment_moved',
                 'appointment_cancelled',
                 'appointment_reminder',
                 'payment_created'
            )
        )
);

CREATE TRIGGER trg_employees_updated_at
    BEFORE UPDATE
    ON employees
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_patients_updated_at
    BEFORE UPDATE
    ON patients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE
    ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_services_updated_at
    BEFORE UPDATE
    ON services
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_appointments_updated_at
    BEFORE UPDATE
    ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_visits_updated_at
    BEFORE UPDATE
    ON visits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_users_role_id
    ON users (role_id);

CREATE INDEX idx_users_employee_id
    ON users (employee_id);

CREATE INDEX idx_users_patient_id
    ON users (patient_id);

CREATE INDEX idx_employees_full_name
    ON employees (last_name, first_name, middle_name);

CREATE INDEX idx_patients_phone
    ON patients (phone);

CREATE INDEX idx_patients_full_name
    ON patients (last_name, first_name, middle_name);

CREATE INDEX idx_doctor_schedules_doctor_date
    ON doctor_schedules (doctor_id, work_date);

CREATE INDEX idx_appointments_patient_id
    ON appointments (patient_id);

CREATE INDEX idx_appointments_doctor_id
    ON appointments (doctor_id);

CREATE INDEX idx_appointments_room_id
    ON appointments (room_id);

CREATE INDEX idx_appointments_service_id
    ON appointments (service_id);

CREATE INDEX idx_appointments_start
    ON appointments (appointment_start);

CREATE INDEX idx_appointments_status
    ON appointments (status);

CREATE UNIQUE INDEX idx_appointments_doctor_time_active
    ON appointments (doctor_id, appointment_start) WHERE status IN (
    'scheduled',
    'moved'
);

CREATE INDEX idx_visits_patient_id
    ON visits (patient_id);

CREATE INDEX idx_visits_doctor_id
    ON visits (doctor_id);

CREATE INDEX idx_visits_date
    ON visits (visit_date);

CREATE INDEX idx_visit_services_visit_id
    ON visit_services (visit_id);

CREATE INDEX idx_visit_services_service_id
    ON visit_services (service_id);

CREATE INDEX idx_payments_visit_id
    ON payments (visit_id);

CREATE INDEX idx_payments_date
    ON payments (payment_date);

CREATE INDEX idx_notifications_user_id
    ON notifications (user_id);

CREATE INDEX idx_notifications_patient_id
    ON notifications (patient_id);

CREATE INDEX idx_notifications_appointment_id
    ON notifications (appointment_id);

CREATE INDEX idx_notifications_is_read
    ON notifications (is_read);