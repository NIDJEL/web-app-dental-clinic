package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AuthUser struct {
	ID           int64
	Login        string
	PasswordHash string
	RoleID       int64
	RoleName     string
	EmployeeID   sql.NullInt64
	PatientID    sql.NullInt64
	IsActive     bool
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
			u.is_active
		FROM users u
		JOIN roles r ON r.id = u.role_id
		WHERE u.login = $1
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
		&user.IsActive,
	)
	if err != nil {
		return nil, fmt.Errorf("find user by login: %w", err)
	}

	return &user, nil
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
			u.is_active
		FROM users u
		JOIN roles r ON r.id = u.role_id
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
		&user.IsActive,
	)
	if err != nil {
		return nil, fmt.Errorf("find user by id: %w", err)
	}

	return &user, nil
}
