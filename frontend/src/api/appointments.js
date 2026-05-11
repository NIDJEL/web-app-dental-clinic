import { apiRequest } from "./client.js";

export function listAppointments() {
  return apiRequest("/appointments");
}

export function createAppointment(payload) {
  return apiRequest("/appointments", {
    method: "POST",
    body: payload
  });
}

export function patchAppointment(id, payload) {
  return apiRequest(`/appointments/${id}`, {
    method: "PATCH",
    body: payload
  });
}

export function availableSlots(doctorId, date) {
  const params = new URLSearchParams({
    doctor_id: doctorId,
    date
  });
  return apiRequest(`/schedule/available-slots?${params.toString()}`);
}
