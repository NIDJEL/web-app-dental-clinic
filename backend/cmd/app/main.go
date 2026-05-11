package main

import (
	"context"
	"log"
	"net/http"

	"dental-clinic-backend/internal/config"
	"dental-clinic-backend/internal/database"
	"dental-clinic-backend/internal/handler"
	"dental-clinic-backend/internal/middleware"
	"dental-clinic-backend/internal/repository"

	"github.com/gin-gonic/gin"
)

func main() {
	ctx := context.Background()

	cfg := config.Load()

	dbPool, err := database.NewPostgresPool(ctx, cfg)
	if err != nil {
		log.Fatal(err)
	}
	defer dbPool.Close()

	userRepository := repository.NewUserRepository(dbPool)
	authHandler := handler.NewAuthHandler(userRepository, cfg)
	appHandler := handler.NewAppHandler(dbPool)

	router := gin.Default()

	router.GET("/health", func(c *gin.Context) {
		var result int

		err := dbPool.QueryRow(c.Request.Context(), "SELECT 1").Scan(&result)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"status": "error",
				"error":  err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":   "ok",
			"database": "connected",
		})
	})

	api := router.Group("/api")

	authRoutes := api.Group("/auth")
	authRoutes.POST("/login", authHandler.Login)
	authRoutes.POST("/register", authHandler.RegisterPatient)
	authRoutes.GET("/me", middleware.AuthMiddleware(cfg), authHandler.Me)

	protected := api.Group("")
	protected.Use(middleware.AuthMiddleware(cfg))

	protected.GET("/users", middleware.RequireRoles("admin"), authHandler.ListUsers)
	protected.POST("/users", middleware.RequireRoles("admin"), authHandler.CreateUser)
	protected.PATCH("/users/:id", middleware.RequireRoles("admin"), authHandler.UpdateUser)

	protected.GET("/patients", appHandler.ListPatients)
	protected.GET("/patients/:id", appHandler.GetPatient)
	protected.POST("/patients", middleware.RequireRoles("admin", "registrar"), appHandler.CreatePatient)
	protected.PUT("/patients/:id", middleware.RequireRoles("admin", "registrar", "patient"), appHandler.UpdatePatient)
	protected.DELETE("/patients/:id", middleware.RequireRoles("admin"), appHandler.DeletePatient)

	protected.GET("/employees", appHandler.ListEmployees)
	protected.POST("/employees", middleware.RequireRoles("admin"), appHandler.CreateEmployee)
	protected.PUT("/employees/:id", middleware.RequireRoles("admin"), appHandler.UpdateEmployee)
	protected.DELETE("/employees/:id", middleware.RequireRoles("admin"), appHandler.DeleteEmployee)

	protected.GET("/services", appHandler.ListServices)
	protected.POST("/services", middleware.RequireRoles("admin"), appHandler.CreateService)
	protected.PUT("/services/:id", middleware.RequireRoles("admin"), appHandler.UpdateService)
	protected.DELETE("/services/:id", middleware.RequireRoles("admin"), appHandler.DeleteService)

	protected.GET("/rooms", appHandler.ListRooms)
	protected.GET("/doctor-schedules", appHandler.ListDoctorSchedules)
	protected.POST("/doctor-schedules", middleware.RequireRoles("admin", "registrar"), appHandler.CreateDoctorSchedule)

	protected.GET("/appointments", appHandler.ListAppointments)
	protected.POST("/appointments", middleware.RequireRoles("admin", "registrar", "patient"), appHandler.CreateAppointment)
	protected.PATCH("/appointments/:id", middleware.RequireRoles("admin", "registrar", "doctor", "patient"), appHandler.PatchAppointment)
	protected.GET("/schedule/available-slots", appHandler.AvailableSlots)

	protected.GET("/visits", middleware.RequireRoles("admin", "registrar", "doctor"), appHandler.ListVisits)
	protected.POST("/visits", middleware.RequireRoles("admin", "doctor"), appHandler.CreateVisit)

	protected.GET("/payments", middleware.RequireRoles("admin", "registrar"), appHandler.ListPayments)
	protected.POST("/payments", middleware.RequireRoles("admin", "registrar"), appHandler.CreatePayment)

	protected.GET("/reports/doctor-load", middleware.RequireRoles("admin"), appHandler.DoctorLoadReport)
	protected.GET("/reports/revenue", middleware.RequireRoles("admin"), appHandler.RevenueReport)
	protected.GET("/reports/appointments-count", middleware.RequireRoles("admin"), appHandler.AppointmentsCountReport)
	protected.GET("/reports/appointment-statuses", middleware.RequireRoles("admin"), appHandler.AppointmentStatusesReport)

	log.Println("Backend started on port " + cfg.AppPort)

	if err := router.Run(":" + cfg.AppPort); err != nil {
		log.Fatal(err)
	}
}
