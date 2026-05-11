package handler

import (
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strings"

	"dental-clinic-backend/internal/auth"
	"dental-clinic-backend/internal/config"
	"dental-clinic-backend/internal/repository"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	users *repository.UserRepository
	cfg   config.Config
}

type LoginRequest struct {
	Login    string `json:"login"`
	Email    string `json:"email"`
	Password string `json:"password" binding:"required"`
}

type RegisterPatientRequest struct {
	LastName     string `json:"last_name" binding:"required"`
	FirstName    string `json:"first_name" binding:"required"`
	MiddleName   string `json:"middle_name"`
	BirthDate    string `json:"birth_date"`
	Phone        string `json:"phone"`
	Email        string `json:"email" binding:"required"`
	Address      string `json:"address"`
	MedicalNotes string `json:"medical_notes"`
	Password     string `json:"password" binding:"required"`
}

type ManageUserRequest struct {
	Login      string `json:"login" binding:"required"`
	Password   string `json:"password"`
	Role       string `json:"role" binding:"required"`
	EmployeeID *int64 `json:"employee_id"`
	PatientID  *int64 `json:"patient_id"`
	IsActive   *bool  `json:"is_active"`
}

func NewAuthHandler(users *repository.UserRepository, cfg config.Config) *AuthHandler {
	return &AuthHandler{
		users: users,
		cfg:   cfg,
	}
}

func (h *AuthHandler) Login(c *gin.Context) {
	var request LoginRequest

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "login and password are required",
		})
		return
	}

	identifier := strings.TrimSpace(request.Login)
	if identifier == "" {
		identifier = strings.TrimSpace(request.Email)
	}
	if identifier == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "login or email is required",
		})
		return
	}

	user, err := h.users.FindByLogin(c.Request.Context(), identifier)
	if err != nil {
		log.Println("find user error:", err)

		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "invalid login or password",
		})
		return
	}

	if !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "user is inactive",
		})
		return
	}

	if !auth.CheckPassword(request.Password, user.PasswordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "invalid login or password",
		})
		return
	}

	h.respondWithToken(c, http.StatusOK, user)
}

func (h *AuthHandler) RegisterPatient(c *gin.Context) {
	var request RegisterPatientRequest

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "invalid request body",
		})
		return
	}

	email := strings.ToLower(strings.TrimSpace(request.Email))
	if email == "" || !strings.Contains(email, "@") {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "valid email is required",
		})
		return
	}
	if len(request.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "password must contain at least 6 characters",
		})
		return
	}

	passwordHash, err := auth.HashPassword(request.Password)
	if err != nil {
		log.Println("hash password error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "could not register patient",
		})
		return
	}

	user, err := h.users.RegisterPatient(c.Request.Context(), repository.RegisterPatientParams{
		LastName:     strings.TrimSpace(request.LastName),
		FirstName:    strings.TrimSpace(request.FirstName),
		MiddleName:   strings.TrimSpace(request.MiddleName),
		BirthDate:    strings.TrimSpace(request.BirthDate),
		Phone:        strings.TrimSpace(request.Phone),
		Email:        email,
		Address:      strings.TrimSpace(request.Address),
		MedicalNotes: strings.TrimSpace(request.MedicalNotes),
		PasswordHash: passwordHash,
	})
	if err != nil {
		if errors.Is(err, repository.ErrUserAlreadyExists) {
			c.JSON(http.StatusConflict, gin.H{
				"error": "patient with this email already exists",
			})
			return
		}

		log.Println("register patient error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "could not register patient",
		})
		return
	}

	h.respondWithToken(c, http.StatusCreated, user)
}

func (h *AuthHandler) respondWithToken(c *gin.Context, status int, user *repository.AuthUser) {
	accessToken, err := auth.GenerateAccessToken(
		user.ID,
		user.RoleName,
		h.cfg.JWTSecret,
	)
	if err != nil {
		log.Println("generate token error:", err)

		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "could not generate token",
		})
		return
	}

	c.JSON(status, gin.H{
		"access_token": accessToken,
		"token_type":   "Bearer",
		"user": gin.H{
			"id":          user.ID,
			"login":       user.Login,
			"role":        user.RoleName,
			"employee_id": nullInt64ToValue(user.EmployeeID),
			"patient_id":  nullInt64ToValue(user.PatientID),
			"full_name":   nullStringToValue(user.FullName),
		},
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "user id not found in context",
		})
		return
	}

	userID, ok := userIDValue.(int64)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "invalid user id",
		})
		return
	}

	user, err := h.users.FindByID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "user not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":          user.ID,
		"login":       user.Login,
		"role":        user.RoleName,
		"employee_id": nullInt64ToValue(user.EmployeeID),
		"patient_id":  nullInt64ToValue(user.PatientID),
		"full_name":   nullStringToValue(user.FullName),
		"is_active":   user.IsActive,
	})
}

func (h *AuthHandler) ListUsers(c *gin.Context) {
	users, err := h.users.ListUsers(c.Request.Context())
	if err != nil {
		log.Println("list users error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not list users"})
		return
	}

	response := make([]gin.H, 0, len(users))
	for _, user := range users {
		response = append(response, managedUserToJSON(user))
	}

	c.JSON(http.StatusOK, response)
}

func (h *AuthHandler) CreateUser(c *gin.Context) {
	var request ManageUserRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	params, ok := h.manageUserParams(c, request, true)
	if !ok {
		return
	}

	id, err := h.users.CreateUser(c.Request.Context(), params)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			c.JSON(http.StatusConflict, gin.H{"error": "login or employee already has user"})
			return
		}
		log.Println("create user error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create user"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *AuthHandler) UpdateUser(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	var request ManageUserRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	params, ok := h.manageUserParams(c, request, false)
	if !ok {
		return
	}

	if err := h.users.UpdateUser(c.Request.Context(), id, params); err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			c.JSON(http.StatusConflict, gin.H{"error": "login or employee already has user"})
			return
		}
		log.Println("update user error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user updated"})
}

func (h *AuthHandler) manageUserParams(c *gin.Context, request ManageUserRequest, requirePassword bool) (repository.ManageUserParams, bool) {
	login := strings.TrimSpace(request.Login)
	role := strings.TrimSpace(request.Role)
	if login == "" || role == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "login and role are required"})
		return repository.ManageUserParams{}, false
	}

	if role != "admin" && role != "registrar" && role != "doctor" && role != "patient" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return repository.ManageUserParams{}, false
	}

	if requirePassword && len(request.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password must contain at least 6 characters"})
		return repository.ManageUserParams{}, false
	}
	if request.Password != "" && len(request.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password must contain at least 6 characters"})
		return repository.ManageUserParams{}, false
	}

	if role == "patient" && request.PatientID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "patient role requires patient_id"})
		return repository.ManageUserParams{}, false
	}
	if role != "patient" && request.EmployeeID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "staff role requires employee_id"})
		return repository.ManageUserParams{}, false
	}

	passwordHash := ""
	if request.Password != "" {
		var err error
		passwordHash, err = auth.HashPassword(request.Password)
		if err != nil {
			log.Println("hash user password error:", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not hash password"})
			return repository.ManageUserParams{}, false
		}
	}

	isActive := true
	if request.IsActive != nil {
		isActive = *request.IsActive
	}

	params := repository.ManageUserParams{
		Login:        login,
		PasswordHash: passwordHash,
		RoleName:     role,
		IsActive:     isActive,
	}
	if request.EmployeeID != nil {
		params.EmployeeID = sql.NullInt64{Int64: *request.EmployeeID, Valid: true}
	}
	if request.PatientID != nil {
		params.PatientID = sql.NullInt64{Int64: *request.PatientID, Valid: true}
	}

	return params, true
}

func managedUserToJSON(user repository.ManagedUser) gin.H {
	return gin.H{
		"id":            user.ID,
		"login":         user.Login,
		"role":          user.RoleName,
		"employee_id":   nullInt64ToValue(user.EmployeeID),
		"employee_name": nullStringToValue(user.EmployeeName),
		"patient_id":    nullInt64ToValue(user.PatientID),
		"patient_name":  nullStringToValue(user.PatientName),
		"is_active":     user.IsActive,
	}
}
