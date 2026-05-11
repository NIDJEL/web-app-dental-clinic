package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrUserAlreadyExists = errors.New("user already exists")

type AuthUser struct {
	ID           int64
	Login        string
	PasswordHash string
	RoleID       int64
	RoleName     string
	EmployeeID   sql.NullInt64
	PatientID    sql.NullInt64
	FullName     sql.NullString
	IsActive     bool
}

type ManagedUser struct {
	ID           int64
	Login        string
	RoleName     string
	EmployeeID   sql.NullInt64
	EmployeeName sql.NullString
	PatientID    sql.NullInt64
	PatientName  sql.NullString
	IsActive     bool
}

type ManageUserParams struct {
	Login        string
	PasswordHash string
	RoleName     string
	EmployeeID   sql.NullInt64
	PatientID    sql.NullInt64
	IsActive     bool
}

type RegisterPatientParams struct {
	LastName     string
	FirstName    string
	MiddleName   string
	BirthDate    string
	Phone        string
	Email        string
	Address      string
	MedicalNotes string
	PasswordHash string
}

type UserRepository struct {
	db *pgxpool.Pool
}

func NewUserRepository(db *pgxpool.Pool) *UserRepository {
	return &UserRepository{
		db: db,
	}
}

func (r *UserRepository) FindByLogin(ctx context.Context, login string) (*AuthUser, error) {
	query := `
		SELECT
			u.id,
			u.login,
			u.password_hash,
			u.role_id,
			r.name,
			u.employee_id,
			u.patient_id,
			CASE
				WHEN e.id IS NOT NULL THEN concat_ws(' ', e.last_name, e.first_name, e.middle_name)
				WHEN p.id IS NOT NULL THEN concat_ws(' ', p.last_name, p.first_name, p.middle_name)
				ELSE u.login
			END AS full_name,
			u.is_active
		FROM users u
		JOIN roles r ON r.id = u.role_id
		LEFT JOIN employees e ON e.id = u.employee_id
		LEFT JOIN patients p ON p.id = u.patient_id
		WHERE lower(u.login) = lower($1)
			OR lower(COALESCE(e.email, '')) = lower($1)
			OR lower(COALESCE(p.email, '')) = lower($1)
		ORDER BY
			CASE WHEN lower(u.login) = lower($1) THEN 0 ELSE 1 END,
			u.id
		LIMIT 1
	`

	var user AuthUser

	err := r.db.QueryRow(ctx, query, login).Scan(
		&user.ID,
		&user.Login,
		&user.PasswordHash,
		&user.RoleID,
		&user.RoleName,
		&user.EmployeeID,
		&user.PatientID,
		&user.FullName,
		&user.IsActive,
	)
	if err != nil {
		return nil, fmt.Errorf("find user by login: %w", err)
	}

	return &user, nil
}

func (r *UserRepository) RegisterPatient(ctx context.Context, params RegisterPatientParams) (*AuthUser, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin register patient transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var exists bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM users WHERE lower(login) = lower($1)
			UNION ALL
			SELECT 1 FROM patients WHERE lower(COALESCE(email, '')) = lower($1)
			UNION ALL
			SELECT 1 FROM employees WHERE lower(COALESCE(email, '')) = lower($1)
		)
	`, params.Email).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check patient email: %w", err)
	}
	if exists {
		return nil, ErrUserAlreadyExists
	}

	var roleID int64
	err = tx.QueryRow(ctx, "SELECT id FROM roles WHERE name = 'patient' LIMIT 1").Scan(&roleID)
	if err != nil {
		return nil, fmt.Errorf("find patient role: %w", err)
	}

	var patientID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO patients (
			last_name,
			first_name,
			middle_name,
			birth_date,
			phone,
			email,
			address,
			medical_notes
		)
		VALUES (
			$1,
			$2,
			NULLIF($3, ''),
			NULLIF($4, '')::date,
			$5,
			$6,
			NULLIF($7, ''),
			NULLIF($8, '')
		)
		RETURNING id
	`,
		params.LastName,
		params.FirstName,
		params.MiddleName,
		params.BirthDate,
		params.Phone,
		params.Email,
		params.Address,
		params.MedicalNotes,
	).Scan(&patientID)
	if err != nil {
		return nil, fmt.Errorf("insert patient: %w", err)
	}

	var userID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO users (
			login,
			password_hash,
			role_id,
			patient_id
		)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, params.Email, params.PasswordHash, roleID, patientID).Scan(&userID)
	if err != nil {
		return nil, fmt.Errorf("insert patient user: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit register patient transaction: %w", err)
	}

	return &AuthUser{
		ID:           userID,
		Login:        params.Email,
		PasswordHash: params.PasswordHash,
		RoleID:       roleID,
		RoleName:     "patient",
		PatientID:    sql.NullInt64{Int64: patientID, Valid: true},
		FullName:     sql.NullString{String: params.LastName + " " + params.FirstName + " " + params.MiddleName, Valid: true},
		IsActive:     true,
	}, nil
}

func (r *UserRepository) FindByID(ctx context.Context, id int64) (*AuthUser, error) {
	query := `
		SELECT
			u.id,
			u.login,
			u.password_hash,
			u.role_id,
			r.name,
			u.employee_id,
			u.patient_id,
			CASE
				WHEN e.id IS NOT NULL THEN concat_ws(' ', e.last_name, e.first_name, e.middle_name)
				WHEN p.id IS NOT NULL THEN concat_ws(' ', p.last_name, p.first_name, p.middle_name)
				ELSE u.login
			END AS full_name,
			u.is_active
		FROM users u
		JOIN roles r ON r.id = u.role_id
		LEFT JOIN employees e ON e.id = u.employee_id
		LEFT JOIN patients p ON p.id = u.patient_id
		WHERE u.id = $1
		LIMIT 1
	`

	var user AuthUser

	err := r.db.QueryRow(ctx, query, id).Scan(
		&user.ID,
		&user.Login,
		&user.PasswordHash,
		&user.RoleID,
		&user.RoleName,
		&user.EmployeeID,
		&user.PatientID,
		&user.FullName,
		&user.IsActive,
	)
	if err != nil {
		return nil, fmt.Errorf("find user by id: %w", err)
	}

	return &user, nil
}

func (r *UserRepository) ListUsers(ctx context.Context) ([]ManagedUser, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			u.id,
			u.login,
			roles.name,
			u.employee_id,
			CASE
				WHEN e.id IS NOT NULL THEN concat_ws(' ', e.last_name, e.first_name, e.middle_name)
				ELSE NULL
			END AS employee_name,
			u.patient_id,
			CASE
				WHEN p.id IS NOT NULL THEN concat_ws(' ', p.last_name, p.first_name, p.middle_name)
				ELSE NULL
			END AS patient_name,
			u.is_active
		FROM users u
		JOIN roles ON roles.id = u.role_id
		LEFT JOIN employees e ON e.id = u.employee_id
		LEFT JOIN patients p ON p.id = u.patient_id
		ORDER BY u.id
	`)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	users := make([]ManagedUser, 0)
	for rows.Next() {
		var user ManagedUser
		if err := rows.Scan(
			&user.ID,
			&user.Login,
			&user.RoleName,
			&user.EmployeeID,
			&user.EmployeeName,
			&user.PatientID,
			&user.PatientName,
			&user.IsActive,
		); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, user)
	}

	return users, nil
}

func (r *UserRepository) CreateUser(ctx context.Context, params ManageUserParams) (int64, error) {
	var id int64
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (
			login,
			password_hash,
			role_id,
			employee_id,
			patient_id,
			is_active
		)
		VALUES (
			$1,
			$2,
			(SELECT id FROM roles WHERE name = $3 LIMIT 1),
			$4,
			$5,
			$6
		)
		RETURNING id
	`, params.Login, params.PasswordHash, params.RoleName, params.EmployeeID, params.PatientID, params.IsActive).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("create user: %w", err)
	}

	return id, nil
}

func (r *UserRepository) UpdateUser(ctx context.Context, id int64, params ManageUserParams) error {
	_, err := r.db.Exec(ctx, `
		UPDATE users
		SET
			login = $1,
			role_id = (SELECT id FROM roles WHERE name = $2 LIMIT 1),
			employee_id = $3,
			patient_id = $4,
			is_active = $5,
			password_hash = COALESCE(NULLIF($6, ''), password_hash)
		WHERE id = $7
	`, params.Login, params.RoleName, params.EmployeeID, params.PatientID, params.IsActive, params.PasswordHash, id)
	if err != nil {
		return fmt.Errorf("update user: %w", err)
	}

	return nil
}
