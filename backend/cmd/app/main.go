package main

import (
	"context"
	"dental-clinic-backend/internal/config"
	"dental-clinic-backend/internal/database"
	"log"
	"net/http"

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

	log.Println("Backend started on port" + cfg.AppPort)

	if err := router.Run(":" + cfg.AppPort); err != nil {
		log.Fatal(err)
	}
}
