package handler

import (
	"log"
	"net/http"

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
	Login    string `json:"login" binding:"required"`
	Password string `json:"password" binding:"required"`
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

	user, err := h.users.FindByLogin(c.Request.Context(), request.Login)
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

	c.JSON(http.StatusOK, gin.H{
		"access_token": accessToken,
		"token_type":   "Bearer",
		"user": gin.H{
			"id":          user.ID,
			"login":       user.Login,
			"role":        user.RoleName,
			"employee_id": nullInt64ToValue(user.EmployeeID),
			"patient_id":  nullInt64ToValue(user.PatientID),
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
		"is_active":   user.IsActive,
	})
}
