package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	AppPort    string
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string
	DBSchema   string
	JWTSecret  string
}

func Load() Config {
	_ = godotenv.Load(".env")
	_ = godotenv.Load("../.env")

	cfg := Config{
		AppPort:    getEnv("APP_PORT", "8080"),
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: getEnv("DB_PASSWORD", "12345"),
		DBName:     getEnv("DB_NAME", "dental_clinic"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),
		DBSchema:   getEnv("DB_SCHEMA", "dental_clinic"),
		JWTSecret:  getEnv("JWT_SECRET", "super_secret_key_change_later"),
	}

	return cfg
}

func DatabaseURL(c Config) string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		c.DBUser,
		c.DBPassword,
		c.DBHost,
		c.DBPort,
		c.DBName,
		c.DBSSLMode,
	)
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}
