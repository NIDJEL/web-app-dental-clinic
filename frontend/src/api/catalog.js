import { apiRequest } from "./client.js";

export const getPatients = () => apiRequest("/patients");
export const getPatient = (id) => apiRequest(`/patients/${id}`);
export const getEmployees = () => apiRequest("/employees");
export const getServices = () => apiRequest("/services");
export const getRooms = () => apiRequest("/rooms");
export const getDoctorSchedules = () => apiRequest("/doctor-schedules");
export const getVisits = () => apiRequest("/visits");
export const getPayments = () => apiRequest("/payments");
export const getUsers = () => apiRequest("/users");

export const createPatient = (payload) =>
  apiRequest("/patients", { method: "POST", body: payload });

export const updatePatient = (id, payload) =>
  apiRequest(`/patients/${id}`, { method: "PUT", body: payload });

export const createEmployee = (payload) =>
  apiRequest("/employees", { method: "POST", body: payload });

export const createService = (payload) =>
  apiRequest("/services", { method: "POST", body: payload });

export const createDoctorSchedule = (payload) =>
  apiRequest("/doctor-schedules", { method: "POST", body: payload });

export const createVisit = (payload) =>
  apiRequest("/visits", { method: "POST", body: payload });

export const createPayment = (payload) =>
  apiRequest("/payments", { method: "POST", body: payload });

export const createUser = (payload) =>
  apiRequest("/users", { method: "POST", body: payload });

export const updateUser = (id, payload) =>
  apiRequest(`/users/${id}`, { method: "PATCH", body: payload });

export const getDoctorLoadReport = () => apiRequest("/reports/doctor-load");
export const getRevenueReport = () => apiRequest("/reports/revenue");
export const getAppointmentsCountReport = () =>
  apiRequest("/reports/appointments-count");
export const getAppointmentStatusesReport = () =>
  apiRequest("/reports/appointment-statuses");
