package handler

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AppHandler struct {
	db *pgxpool.Pool
}

func NewAppHandler(db *pgxpool.Pool) *AppHandler {
	return &AppHandler{db: db}
}

func jsonString(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}

func jsonInt64(value sql.NullInt64) any {
	if !value.Valid {
		return nil
	}
	return value.Int64
}

func parseID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return 0, false
	}
	return id, true
}

func handleDBError(c *gin.Context, err error) {
	if err == pgx.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "record not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
}

type PatientRequest struct {
	LastName     string `json:"last_name" binding:"required"`
	FirstName    string `json:"first_name" binding:"required"`
	MiddleName   string `json:"middle_name"`
	BirthDate    string `json:"birth_date"`
	Phone        string `json:"phone" binding:"required"`
	Email        string `json:"email"`
	Address      string `json:"address"`
	MedicalNotes string `json:"medical_notes"`
}

func (h *AppHandler) ListPatients(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT
			id,
			last_name,
			first_name,
			middle_name,
			TO_CHAR(birth_date, 'YYYY-MM-DD') AS birth_date,
			phone,
			email,
			address,
			medical_notes,
			created_at,
			updated_at
		FROM patients
		ORDER BY id
	`)
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer rows.Close()

	patients := make([]gin.H, 0)
	for rows.Next() {
		var (
			id           int64
			lastName     string
			firstName    string
			middleName   sql.NullString
			birthDate    sql.NullString
			phone        string
			email        sql.NullString
			address      sql.NullString
			medicalNotes sql.NullString
			createdAt    time.Time
			updatedAt    time.Time
		)

		err := rows.Scan(
			&id,
			&lastName,
			&firstName,
			&middleName,
			&birthDate,
			&phone,
			&email,
			&address,
			&medicalNotes,
			&createdAt,
			&updatedAt,
		)
		if err != nil {
			handleDBError(c, err)
			return
		}

		patients = append(patients, gin.H{
			"id":            id,
			"last_name":     lastName,
			"first_name":    firstName,
			"middle_name":   jsonString(middleName),
			"birth_date":    jsonString(birthDate),
			"phone":         phone,
			"email":         jsonString(email),
			"address":       jsonString(address),
			"medical_notes": jsonString(medicalNotes),
			"created_at":    createdAt,
			"updated_at":    updatedAt,
		})
	}

	c.JSON(http.StatusOK, patients)
}

func (h *AppHandler) GetPatient(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	var (
		lastName     string
		firstName    string
		middleName   sql.NullString
		birthDate    sql.NullString
		phone        string
		email        sql.NullString
		address      sql.NullString
		medicalNotes sql.NullString
		createdAt    time.Time
		updatedAt    time.Time
	)

	err := h.db.QueryRow(c.Request.Context(), `
		SELECT
			last_name,
			first_name,
			middle_name,
			TO_CHAR(birth_date, 'YYYY-MM-DD') AS birth_date,
			phone,
			email,
			address,
			medical_notes,
			created_at,
			updated_at
		FROM patients
		WHERE id = $1
	`, id).Scan(
		&lastName,
		&firstName,
		&middleName,
		&birthDate,
		&phone,
		&email,
		&address,
		&medicalNotes,
		&createdAt,
		&updatedAt,
	)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":            id,
		"last_name":     lastName,
		"first_name":    firstName,
		"middle_name":   jsonString(middleName),
		"birth_date":    jsonString(birthDate),
		"phone":         phone,
		"email":         jsonString(email),
		"address":       jsonString(address),
		"medical_notes": jsonString(medicalNotes),
		"created_at":    createdAt,
		"updated_at":    updatedAt,
	})
}

func (h *AppHandler) CreatePatient(c *gin.Context) {
	var request PatientRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	var id int64
	err := h.db.QueryRow(c.Request.Context(), `
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
			NULLIF($6, ''),
			NULLIF($7, ''),
			NULLIF($8, '')
		)
		RETURNING id
	`,
		request.LastName,
		request.FirstName,
		request.MiddleName,
		request.BirthDate,
		request.Phone,
		request.Email,
		request.Address,
		request.MedicalNotes,
	).Scan(&id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *AppHandler) UpdatePatient(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	var request PatientRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	_, err := h.db.Exec(c.Request.Context(), `
		UPDATE patients
		SET
			last_name = $1,
			first_name = $2,
			middle_name = NULLIF($3, ''),
			birth_date = NULLIF($4, '')::date,
			phone = $5,
			email = NULLIF($6, ''),
			address = NULLIF($7, ''),
			medical_notes = NULLIF($8, '')
		WHERE id = $9
	`,
		request.LastName,
		request.FirstName,
		request.MiddleName,
		request.BirthDate,
		request.Phone,
		request.Email,
		request.Address,
		request.MedicalNotes,
		id,
	)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "patient updated"})
}

func (h *AppHandler) DeletePatient(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	_, err := h.db.Exec(c.Request.Context(), "DELETE FROM patients WHERE id = $1", id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "patient deleted"})
}

type EmployeeRequest struct {
	LastName   string `json:"last_name" binding:"required"`
	FirstName  string `json:"first_name" binding:"required"`
	MiddleName string `json:"middle_name"`
	Position   string `json:"position" binding:"required"`
	Phone      string `json:"phone"`
	Email      string `json:"email"`
}

func (h *AppHandler) ListEmployees(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT
			id,
			last_name,
			first_name,
			middle_name,
			position,
			phone,
			email,
			is_active
		FROM employees
		ORDER BY id
	`)
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer rows.Close()

	employees := make([]gin.H, 0)
	for rows.Next() {
		var (
			id         int64
			lastName   string
			firstName  string
			middleName sql.NullString
			position   string
			phone      sql.NullString
			email      sql.NullString
			isActive   bool
		)

		err := rows.Scan(&id, &lastName, &firstName, &middleName, &position, &phone, &email, &isActive)
		if err != nil {
			handleDBError(c, err)
			return
		}

		employees = append(employees, gin.H{
			"id":          id,
			"last_name":   lastName,
			"first_name":  firstName,
			"middle_name": jsonString(middleName),
			"position":    position,
			"phone":       jsonString(phone),
			"email":       jsonString(email),
			"is_active":   isActive,
		})
	}

	c.JSON(http.StatusOK, employees)
}

func (h *AppHandler) CreateEmployee(c *gin.Context) {
	var request EmployeeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	var id int64
	err := h.db.QueryRow(c.Request.Context(), `
		INSERT INTO employees (
			last_name,
			first_name,
			middle_name,
			position,
			phone,
			email
		)
		VALUES ($1, $2, NULLIF($3, ''), $4, NULLIF($5, ''), NULLIF($6, ''))
		RETURNING id
	`, request.LastName, request.FirstName, request.MiddleName, request.Position, request.Phone, request.Email).Scan(&id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *AppHandler) UpdateEmployee(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	var request EmployeeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	_, err := h.db.Exec(c.Request.Context(), `
		UPDATE employees
		SET
			last_name = $1,
			first_name = $2,
			middle_name = NULLIF($3, ''),
			position = $4,
			phone = NULLIF($5, ''),
			email = NULLIF($6, '')
		WHERE id = $7
	`, request.LastName, request.FirstName, request.MiddleName, request.Position, request.Phone, request.Email, id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "employee updated"})
}

func (h *AppHandler) DeleteEmployee(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	_, err := h.db.Exec(c.Request.Context(), "UPDATE employees SET is_active = false WHERE id = $1", id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "employee disabled"})
}

type ServiceRequest struct {
	Name            string  `json:"name" binding:"required"`
	Description     string  `json:"description"`
	Price           float64 `json:"price" binding:"required"`
	DurationMinutes int     `json:"duration_minutes" binding:"required"`
}

func (h *AppHandler) ListServices(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT
			id,
			name,
			description,
			price,
			duration_minutes,
			is_active
		FROM services
		ORDER BY id
	`)
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer rows.Close()

	services := make([]gin.H, 0)
	for rows.Next() {
		var (
			id              int64
			name            string
			description     sql.NullString
			price           float64
			durationMinutes int
			isActive        bool
		)

		err := rows.Scan(&id, &name, &description, &price, &durationMinutes, &isActive)
		if err != nil {
			handleDBError(c, err)
			return
		}

		services = append(services, gin.H{
			"id":               id,
			"name":             name,
			"description":      jsonString(description),
			"price":            price,
			"duration_minutes": durationMinutes,
			"is_active":        isActive,
		})
	}

	c.JSON(http.StatusOK, services)
}

func (h *AppHandler) CreateService(c *gin.Context) {
	var request ServiceRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	var id int64
	err := h.db.QueryRow(c.Request.Context(), `
		INSERT INTO services (
			name,
			description,
			price,
			duration_minutes
		)
		VALUES ($1, NULLIF($2, ''), $3, $4)
		RETURNING id
	`, request.Name, request.Description, request.Price, request.DurationMinutes).Scan(&id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *AppHandler) UpdateService(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	var request ServiceRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	_, err := h.db.Exec(c.Request.Context(), `
		UPDATE services
		SET
			name = $1,
			description = NULLIF($2, ''),
			price = $3,
			duration_minutes = $4
		WHERE id = $5
	`, request.Name, request.Description, request.Price, request.DurationMinutes, id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "service updated"})
}

func (h *AppHandler) DeleteService(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	_, err := h.db.Exec(c.Request.Context(), "UPDATE services SET is_active = false WHERE id = $1", id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "service disabled"})
}

type AppointmentRequest struct {
	PatientID        int64  `json:"patient_id" binding:"required"`
	DoctorID         int64  `json:"doctor_id" binding:"required"`
	RoomID           *int64 `json:"room_id"`
	ServiceID        *int64 `json:"service_id"`
	AppointmentStart string `json:"appointment_start" binding:"required"`
	AppointmentEnd   string `json:"appointment_end" binding:"required"`
	Comment          string `json:"comment"`
}

type AppointmentPatchRequest struct {
	AppointmentStart *string `json:"appointment_start"`
	AppointmentEnd   *string `json:"appointment_end"`
	Status           *string `json:"status"`
	Comment          *string `json:"comment"`
}

func (h *AppHandler) ListAppointments(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT
			a.id,
			a.patient_id,
			p.last_name || ' ' || p.first_name AS patient_name,
			a.doctor_id,
			e.last_name || ' ' || e.first_name AS doctor_name,
			a.room_id,
			r.name AS room_name,
			a.service_id,
			s.name AS service_name,
			a.appointment_start,
			a.appointment_end,
			a.status,
			a.comment
		FROM appointments a
		JOIN patients p ON p.id = a.patient_id
		JOIN employees e ON e.id = a.doctor_id
		LEFT JOIN rooms r ON r.id = a.room_id
		LEFT JOIN services s ON s.id = a.service_id
		ORDER BY a.appointment_start DESC
	`)
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer rows.Close()

	appointments := make([]gin.H, 0)
	for rows.Next() {
		var (
			id               int64
			patientID        int64
			patientName      string
			doctorID         int64
			doctorName       string
			roomID           sql.NullInt64
			roomName         sql.NullString
			serviceID        sql.NullInt64
			serviceName      sql.NullString
			appointmentStart time.Time
			appointmentEnd   time.Time
			status           string
			comment          sql.NullString
		)

		err := rows.Scan(
			&id,
			&patientID,
			&patientName,
			&doctorID,
			&doctorName,
			&roomID,
			&roomName,
			&serviceID,
			&serviceName,
			&appointmentStart,
			&appointmentEnd,
			&status,
			&comment,
		)
		if err != nil {
			handleDBError(c, err)
			return
		}

		appointments = append(appointments, gin.H{
			"id":                id,
			"patient_id":        patientID,
			"patient_name":      patientName,
			"doctor_id":         doctorID,
			"doctor_name":       doctorName,
			"room_id":           jsonInt64(roomID),
			"room_name":         jsonString(roomName),
			"service_id":        jsonInt64(serviceID),
			"service_name":      jsonString(serviceName),
			"appointment_start": appointmentStart,
			"appointment_end":   appointmentEnd,
			"status":            status,
			"comment":           jsonString(comment),
		})
	}

	c.JSON(http.StatusOK, appointments)
}

func (h *AppHandler) CreateAppointment(c *gin.Context) {
	var request AppointmentRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	var id int64
	err := h.db.QueryRow(c.Request.Context(), `
		INSERT INTO appointments (
			patient_id,
			doctor_id,
			room_id,
			service_id,
			appointment_start,
			appointment_end,
			comment
		)
		VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, NULLIF($7, ''))
		RETURNING id
	`, request.PatientID, request.DoctorID, request.RoomID, request.ServiceID, request.AppointmentStart, request.AppointmentEnd, request.Comment).Scan(&id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *AppHandler) PatchAppointment(c *gin.Context) {
	id, ok := parseID(c)
	if !ok {
		return
	}

	var request AppointmentPatchRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	_, err := h.db.Exec(c.Request.Context(), `
		UPDATE appointments
		SET
			appointment_start = COALESCE($1::timestamptz, appointment_start),
			appointment_end = COALESCE($2::timestamptz, appointment_end),
			status = COALESCE(NULLIF($3, ''), status),
			comment = COALESCE($4, comment)
		WHERE id = $5
	`, request.AppointmentStart, request.AppointmentEnd, request.Status, request.Comment, id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "appointment updated"})
}

func (h *AppHandler) AvailableSlots(c *gin.Context) {
	doctorID, err := strconv.ParseInt(c.Query("doctor_id"), 10, 64)
	if err != nil || doctorID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "doctor_id is required"})
		return
	}

	date := c.Query("date")
	if date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "date is required"})
		return
	}

	rows, err := h.db.Query(c.Request.Context(), `
		SELECT slot_value
		FROM doctor_schedules ds
		CROSS JOIN LATERAL generate_series(
			(ds.work_date + ds.start_time)::timestamp,
			(ds.work_date + ds.end_time - interval '30 minutes')::timestamp,
			interval '30 minutes'
		) AS slot_value
		WHERE ds.doctor_id = $1
			AND ds.work_date = $2::date
			AND ds.is_available = true
			AND NOT EXISTS (
				SELECT 1
				FROM appointments a
				WHERE a.doctor_id = ds.doctor_id
					AND a.status IN ('scheduled', 'moved')
					AND a.appointment_start::timestamp = slot_value
			)
		ORDER BY slot_value
	`, doctorID, date)
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer rows.Close()

	slots := make([]string, 0)
	for rows.Next() {
		var slot time.Time
		if err := rows.Scan(&slot); err != nil {
			handleDBError(c, err)
			return
		}
		slots = append(slots, slot.Format("2006-01-02T15:04:05"))
	}

	c.JSON(http.StatusOK, gin.H{"slots": slots})
}

type VisitRequest struct {
	AppointmentID int64   `json:"appointment_id" binding:"required"`
	DoctorID      int64   `json:"doctor_id" binding:"required"`
	PatientID     int64   `json:"patient_id" binding:"required"`
	Diagnosis     string  `json:"diagnosis"`
	Result        string  `json:"result"`
	DoctorComment string  `json:"doctor_comment"`
	ServiceIDs    []int64 `json:"service_ids"`
}

func (h *AppHandler) ListVisits(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT
			v.id,
			v.appointment_id,
			v.doctor_id,
			e.last_name || ' ' || e.first_name AS doctor_name,
			v.patient_id,
			p.last_name || ' ' || p.first_name AS patient_name,
			v.visit_date,
			v.diagnosis,
			v.result,
			v.doctor_comment
		FROM visits v
		JOIN employees e ON e.id = v.doctor_id
		JOIN patients p ON p.id = v.patient_id
		ORDER BY v.visit_date DESC
	`)
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer rows.Close()

	visits := make([]gin.H, 0)
	for rows.Next() {
		var (
			id             int64
			appointmentID  int64
			doctorID       int64
			doctorName     string
			patientID      int64
			patientName    string
			visitDate      time.Time
			diagnosis      sql.NullString
			result         sql.NullString
			doctorComment  sql.NullString
		)

		err := rows.Scan(
			&id,
			&appointmentID,
			&doctorID,
			&doctorName,
			&patientID,
			&patientName,
			&visitDate,
			&diagnosis,
			&result,
			&doctorComment,
		)
		if err != nil {
			handleDBError(c, err)
			return
		}

		visits = append(visits, gin.H{
			"id":             id,
			"appointment_id": appointmentID,
			"doctor_id":      doctorID,
			"doctor_name":    doctorName,
			"patient_id":     patientID,
			"patient_name":   patientName,
			"visit_date":     visitDate,
			"diagnosis":      jsonString(diagnosis),
			"result":         jsonString(result),
			"doctor_comment": jsonString(doctorComment),
		})
	}

	c.JSON(http.StatusOK, visits)
}

func (h *AppHandler) CreateVisit(c *gin.Context) {
	var request VisitRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	tx, err := h.db.Begin(c.Request.Context())
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer tx.Rollback(c.Request.Context())

	var visitID int64
	err = tx.QueryRow(c.Request.Context(), `
		INSERT INTO visits (
			appointment_id,
			doctor_id,
			patient_id,
			diagnosis,
			result,
			doctor_comment
		)
		VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''))
		RETURNING id
	`, request.AppointmentID, request.DoctorID, request.PatientID, request.Diagnosis, request.Result, request.DoctorComment).Scan(&visitID)
	if err != nil {
		handleDBError(c, err)
		return
	}

	for _, serviceID := range request.ServiceIDs {
		_, err = tx.Exec(c.Request.Context(), `
			INSERT INTO visit_services (
				visit_id,
				service_id,
				price_at_time
			)
			SELECT
				$1,
				id,
				price
			FROM services
			WHERE id = $2
		`, visitID, serviceID)
		if err != nil {
			handleDBError(c, err)
			return
		}
	}

	_, err = tx.Exec(c.Request.Context(), "UPDATE appointments SET status = 'completed' WHERE id = $1", request.AppointmentID)
	if err != nil {
		handleDBError(c, err)
		return
	}

	if err := tx.Commit(c.Request.Context()); err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": visitID})
}

type PaymentRequest struct {
	VisitID       int64   `json:"visit_id" binding:"required"`
	Amount        float64 `json:"amount" binding:"required"`
	PaymentMethod string  `json:"payment_method" binding:"required"`
	Status        string  `json:"status"`
}

func (h *AppHandler) ListPayments(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT
			id,
			visit_id,
			amount,
			payment_method,
			status,
			payment_date
		FROM payments
		ORDER BY payment_date DESC
	`)
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer rows.Close()

	payments := make([]gin.H, 0)
	for rows.Next() {
		var (
			id            int64
			visitID       int64
			amount        float64
			paymentMethod string
			status        string
			paymentDate   time.Time
		)

		err := rows.Scan(&id, &visitID, &amount, &paymentMethod, &status, &paymentDate)
		if err != nil {
			handleDBError(c, err)
			return
		}

		payments = append(payments, gin.H{
			"id":             id,
			"visit_id":       visitID,
			"amount":         amount,
			"payment_method": paymentMethod,
			"status":         status,
			"payment_date":   paymentDate,
		})
	}

	c.JSON(http.StatusOK, payments)
}

func (h *AppHandler) CreatePayment(c *gin.Context) {
	var request PaymentRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	status := request.Status
	if status == "" {
		status = "paid"
	}

	var id int64
	err := h.db.QueryRow(c.Request.Context(), `
		INSERT INTO payments (
			visit_id,
			amount,
			payment_method,
			status
		)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, request.VisitID, request.Amount, request.PaymentMethod, status).Scan(&id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *AppHandler) DoctorLoadReport(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT
			e.id,
			e.last_name || ' ' || e.first_name AS doctor_name,
			COUNT(a.id) AS appointments_count
		FROM employees e
		LEFT JOIN appointments a ON a.doctor_id = e.id
		WHERE e.position ILIKE '%врач%'
		GROUP BY e.id, doctor_name
		ORDER BY appointments_count DESC
	`)
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer rows.Close()

	result := make([]gin.H, 0)
	for rows.Next() {
		var doctorID int64
		var doctorName string
		var count int64

		if err := rows.Scan(&doctorID, &doctorName, &count); err != nil {
			handleDBError(c, err)
			return
		}

		result = append(result, gin.H{
			"doctor_id":          doctorID,
			"doctor_name":        doctorName,
			"appointments_count": count,
		})
	}

	c.JSON(http.StatusOK, result)
}

func (h *AppHandler) RevenueReport(c *gin.Context) {
	var total float64
	err := h.db.QueryRow(c.Request.Context(), `
		SELECT COALESCE(SUM(amount), 0)
		FROM payments
		WHERE status = 'paid'
	`).Scan(&total)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"total_revenue": total})
}

func (h *AppHandler) AppointmentsCountReport(c *gin.Context) {
	var count int64
	err := h.db.QueryRow(c.Request.Context(), "SELECT COUNT(*) FROM appointments").Scan(&count)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"appointments_count": count})
}

func (h *AppHandler) AppointmentStatusesReport(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT
			status,
			COUNT(*)
		FROM appointments
		GROUP BY status
		ORDER BY status
	`)
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer rows.Close()

	result := make([]gin.H, 0)
	for rows.Next() {
		var status string
		var count int64

		if err := rows.Scan(&status, &count); err != nil {
			handleDBError(c, err)
			return
		}

		result = append(result, gin.H{
			"status": status,
			"count":  count,
		})
	}

	c.JSON(http.StatusOK, result)
}

func (h *AppHandler) ListRooms(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT
			id,
			name,
			floor,
			description,
			is_active
		FROM rooms
		ORDER BY id
	`)
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer rows.Close()

	rooms := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var name string
		var floor sql.NullInt64
		var description sql.NullString
		var isActive bool

		if err := rows.Scan(&id, &name, &floor, &description, &isActive); err != nil {
			handleDBError(c, err)
			return
		}

		rooms = append(rooms, gin.H{
			"id":          id,
			"name":        name,
			"floor":       jsonInt64(floor),
			"description": jsonString(description),
			"is_active":   isActive,
		})
	}

	c.JSON(http.StatusOK, rooms)
}

func (h *AppHandler) CreateDoctorSchedule(c *gin.Context) {
	var request struct {
		DoctorID    int64  `json:"doctor_id" binding:"required"`
		RoomID      *int64 `json:"room_id"`
		WorkDate    string `json:"work_date" binding:"required"`
		StartTime   string `json:"start_time" binding:"required"`
		EndTime     string `json:"end_time" binding:"required"`
		IsAvailable *bool  `json:"is_available"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	isAvailable := true
	if request.IsAvailable != nil {
		isAvailable = *request.IsAvailable
	}

	var id int64
	err := h.db.QueryRow(c.Request.Context(), `
		INSERT INTO doctor_schedules (
			doctor_id,
			room_id,
			work_date,
			start_time,
			end_time,
			is_available
		)
		VALUES ($1, $2, $3::date, $4::time, $5::time, $6)
		RETURNING id
	`, request.DoctorID, request.RoomID, request.WorkDate, request.StartTime, request.EndTime, isAvailable).Scan(&id)
	if err != nil {
		handleDBError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *AppHandler) ListDoctorSchedules(c *gin.Context) {
	rows, err := h.db.Query(c.Request.Context(), `
		SELECT
			ds.id,
			ds.doctor_id,
			e.last_name || ' ' || e.first_name AS doctor_name,
			ds.room_id,
			r.name AS room_name,
			ds.work_date,
			ds.start_time,
			ds.end_time,
			ds.is_available
		FROM doctor_schedules ds
		JOIN employees e ON e.id = ds.doctor_id
		LEFT JOIN rooms r ON r.id = ds.room_id
		ORDER BY ds.work_date DESC, ds.start_time
	`)
	if err != nil {
		handleDBError(c, err)
		return
	}
	defer rows.Close()

	items := make([]gin.H, 0)
	for rows.Next() {
		var id int64
		var doctorID int64
		var doctorName string
		var roomID sql.NullInt64
		var roomName sql.NullString
		var workDate time.Time
		var startTime string
		var endTime string
		var isAvailable bool

		err := rows.Scan(&id, &doctorID, &doctorName, &roomID, &roomName, &workDate, &startTime, &endTime, &isAvailable)
		if err != nil {
			handleDBError(c, err)
			return
		}

		items = append(items, gin.H{
			"id":           id,
			"doctor_id":    doctorID,
			"doctor_name":  doctorName,
			"room_id":      jsonInt64(roomID),
			"room_name":    jsonString(roomName),
			"work_date":    workDate.Format("2006-01-02"),
			"start_time":   startTime,
			"end_time":     endTime,
			"is_available": isAvailable,
		})
	}

	c.JSON(http.StatusOK, items)
}

func (h *AppHandler) NotImplemented(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": fmt.Sprintf("%s is not implemented", c.FullPath())})
}
