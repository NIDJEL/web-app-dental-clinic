import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  LogIn,
  LogOut,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
  UserPlus,
  Users,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  availableSlots,
  createAppointment,
  listAppointments,
  patchAppointment
} from "./api/appointments.js";
import {
  login as authLogin,
  logout as authLogout,
  me,
  registerPatient
} from "./api/auth.js";
import {
  createDoctorSchedule,
  createEmployee,
  createPatient,
  createPayment,
  createService,
  createUser,
  createVisit,
  getAppointmentStatusesReport,
  getAppointmentsCountReport,
  getDoctorLoadReport,
  getDoctorSchedules,
  getEmployees,
  getPayments,
  getPatient,
  getPatients,
  getRevenueReport,
  getRooms,
  getServices,
  getUsers,
  getVisits,
  updatePatient,
  updateUser
} from "./api/catalog.js";
import { getAccessToken } from "./api/client.js";

const ROLE_LABELS = {
  admin: "Администратор",
  registrar: "Регистратор",
  doctor: "Врач",
  patient: "Пациент"
};

const STAFF_ROLE_OPTIONS = [
  { value: "doctor", label: "Врач" },
  { value: "registrar", label: "Регистратор" },
  { value: "admin", label: "Администратор" }
];

const STATUS_LABELS = {
  scheduled: "Запланирован",
  completed: "Завершен",
  cancelled: "Отменен",
  moved: "Перенесен"
};

const PAYMENT_METHODS = {
  cash: "Наличные",
  card: "Карта",
  online: "Онлайн"
};

const PAYMENT_STATUSES = {
  paid: "Оплачен",
  cancelled: "Отменен",
  refunded: "Возврат"
};

const TIME_OPTIONS = createTimeOptions(7, 21, 30);

const emptyWorkspace = {
  patients: [],
  employees: [],
  services: [],
  rooms: [],
  schedules: [],
  appointments: [],
  visits: [],
  payments: [],
  users: [],
  reports: {
    doctorLoad: [],
    revenue: null,
    appointmentsCount: null,
    appointmentStatuses: []
  }
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toInputTime(value) {
  if (!value) return "10:00";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "10:00";
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function toApiDateTime(date, time) {
  return `${date}T${time}:00`;
}

function addMinutes(date, time, minutes) {
  const value = new Date(`${date}T${time}:00`);
  value.setMinutes(value.getMinutes() + Number(minutes || 30));
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(value.getDate()).padStart(2, "0")}T${String(
    value.getHours()
  ).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}:00`;
}

function formatDateTime(value) {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDate(value) {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatRuDateInput(value) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function parseRuDateInput(value) {
  const trimmed = value.trim();
  const ruMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (ruMatch) {
    return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
  }
  return trimmed;
}

function formatMoney(value) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function fullName(person) {
  if (!person) return "Не выбрано";
  return [person.last_name, person.first_name, person.middle_name]
    .filter(Boolean)
    .join(" ");
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function getDoctors(employees) {
  const doctors = employees.filter((employee) => {
    const text = `${employee.position} ${employee.email}`;
    return (
      employee.is_active !== false &&
      (/врач|doctor|стомат/i.test(text) || normalizeText(text).includes("doc"))
    );
  });

  return doctors.length
    ? doctors
    : employees.filter((employee) => employee.is_active !== false);
}

function getActive(items) {
  return items.filter((item) => item.is_active !== false);
}

function getUserDisplayName(user, workspace) {
  if (user?.full_name) return user.full_name;
  if (user?.employee_id) {
    const employee = workspace.employees.find(
      (item) => Number(item.id) === Number(user.employee_id)
    );
    if (employee) return fullName(employee);
  }
  if (user?.patient_id) {
    const patient = workspace.patients.find(
      (item) => Number(item.id) === Number(user.patient_id)
    );
    if (patient) return fullName(patient);
  }
  return user?.login || "";
}

function createTimeOptions(startHour, endHour, stepMinutes) {
  const options = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    for (let minutes = 0; minutes < 60; minutes += stepMinutes) {
      if (hour === endHour && minutes > 0) continue;
      const value = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      options.push({ value, label: value });
    }
  }
  return options;
}

function readableError(error) {
  if (!error) return "Что-то пошло не так";
  if (error.message?.includes("duplicate key")) {
    return "Такая запись уже есть";
  }
  if (error.message?.includes("violates")) {
    return "Проверьте заполнение формы";
  }
  return error.message || "Не удалось выполнить действие";
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [notice, setNotice] = useState(null);
  const [bookingDraft, setBookingDraft] = useState(null);
  const [registerPrefill, setRegisterPrefill] = useState(null);

  const notify = useCallback((type, text) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 4200);
  }, []);

  const loadWorkspace = useCallback(
    async (user = currentUser) => {
      if (!user) return;

      setLoadingWorkspace(true);
      const role = user.role;
      const next = {
        ...emptyWorkspace,
        reports: { ...emptyWorkspace.reports }
      };

      const safe = async (key, request, fallback) => {
        try {
          next[key] = await request();
        } catch (error) {
          next[key] = fallback;
        }
      };

      const safeReport = async (key, request, fallback) => {
        try {
          next.reports[key] = await request();
        } catch (error) {
          next.reports[key] = fallback;
        }
      };

      await Promise.all([
        safe("employees", getEmployees, []),
        safe("services", getServices, []),
        safe("rooms", getRooms, []),
        safe("schedules", getDoctorSchedules, []),
        safe("appointments", listAppointments, [])
      ]);

      if (role === "patient" && user.patient_id) {
        await safe("patients", async () => [await getPatient(user.patient_id)], []);
      }

      if (role !== "patient") {
        await Promise.all([
          safe("patients", getPatients, []),
          safe("visits", getVisits, [])
        ]);
      }

      if (role === "admin" || role === "registrar") {
        await safe("payments", getPayments, []);
      }

      if (role === "admin") {
        await Promise.all([
          safe("users", getUsers, []),
          safeReport("doctorLoad", getDoctorLoadReport, []),
          safeReport("revenue", getRevenueReport, null),
          safeReport("appointmentsCount", getAppointmentsCountReport, null),
          safeReport("appointmentStatuses", getAppointmentStatusesReport, [])
        ]);
      }

      setWorkspace(next);
      setLoadingWorkspace(false);
    },
    [currentUser]
  );

  useEffect(() => {
    async function restoreSession() {
      if (!getAccessToken()) {
        setAuthChecked(true);
        return;
      }

      try {
        const user = await me();
        setCurrentUser(user);
      } catch (error) {
        authLogout();
      } finally {
        setAuthChecked(true);
      }
    }

    restoreSession();
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadWorkspace(currentUser);
    } else {
      setWorkspace(emptyWorkspace);
    }
  }, [currentUser, loadWorkspace]);

  const handleAuthSuccess = (payload) => {
    const user = payload.user || payload;
    setCurrentUser(user);
    setAuthOpen(false);
    notify("success", `Вы вошли как ${ROLE_LABELS[user.role] || user.role}`);
  };

  const handleLogout = () => {
    authLogout();
    setCurrentUser(null);
    setBookingDraft(null);
    setRegisterPrefill(null);
    notify("info", "Вы вышли из кабинета");
  };

  const handleLeadBooking = (form) => {
    setBookingDraft({
      date: form.preferred_date,
      time: form.preferred_time,
      comment: form.comment
    });
    setRegisterPrefill({
      last_name: form.last_name,
      first_name: form.first_name,
      birth_date: form.birth_date
    });
    setAuthMode("register");
    setAuthOpen(true);
  };

  if (!authChecked) {
    return <LoadingScreen />;
  }

  return (
    <div className={`app-shell ${currentUser ? "dashboard-mode" : "public-mode"}`}>
      <Header
        currentUser={currentUser}
        onLogin={() => {
          setAuthMode("login");
          setAuthOpen(true);
        }}
        onRegister={() => {
          setRegisterPrefill(null);
          setAuthMode("register");
          setAuthOpen(true);
        }}
        onLogout={handleLogout}
      />

      {notice && <Toast notice={notice} onClose={() => setNotice(null)} />}

      {currentUser ? (
        <Dashboard
          currentUser={currentUser}
          workspace={workspace}
          loading={loadingWorkspace}
          draft={bookingDraft}
          onClearDraft={() => setBookingDraft(null)}
          onReload={() => loadWorkspace(currentUser)}
          notify={notify}
        />
      ) : (
        <PublicHome
          onLeadBooking={handleLeadBooking}
          onLogin={() => {
            setAuthMode("login");
            setAuthOpen(true);
          }}
        />
      )}

      {authOpen && (
        <AuthDialog
          initialMode={authMode}
          initialRegisterData={registerPrefill}
          onClose={() => setAuthOpen(false)}
          onSuccess={handleAuthSuccess}
          notify={notify}
        />
      )}
    </div>
  );
}

function Header({ currentUser, onLogin, onRegister, onLogout }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <Stethoscope size={22} aria-hidden="true" />
        </div>
        <div>
          <p className="eyebrow">РЖД — Медицина</p>
          <strong>Стоматологическая клиника</strong>
        </div>
      </div>

      <div className="topbar-actions">
        {currentUser ? (
          <>
            <span className="role-pill">
              {ROLE_LABELS[currentUser.role] || currentUser.role}
            </span>
            <Button variant="ghost" icon={LogOut} onClick={onLogout}>
              Выйти
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" icon={UserPlus} onClick={onRegister}>
              Регистрация
            </Button>
            <Button icon={LogIn} onClick={onLogin}>
              Войти
            </Button>
          </>
        )}
      </div>
    </header>
  );
}

function PublicHome({ onLeadBooking, onLogin }) {
  return (
    <main className="public-page">
      <section className="booking-hero">
        <div className="hero-copy">
          <p className="eyebrow">Запись без звонка</p>
          <h1>Запишитесь к стоматологу в удобное время</h1>
          <p>
            Оставьте данные, создайте пациентский кабинет и завершите выбор
            врача, услуги и времени в личном кабинете.
          </p>
          <div className="hero-actions">
            <Button icon={LogIn} onClick={onLogin}>
              Войти в кабинет
            </Button>
          </div>
          <div className="contact-strip" aria-label="Контакты клиники">
            <span>
              <Phone size={16} aria-hidden="true" />
              +7 900 000-00-00
            </span>
            <span>
              <Mail size={16} aria-hidden="true" />
              clinic@example.com
            </span>
          </div>
        </div>

        <LeadBookingForm onSubmit={onLeadBooking} />
      </section>

    </main>
  );
}

function LeadBookingForm({ onSubmit }) {
  const [form, setForm] = useState({
    last_name: "",
    first_name: "",
    birth_date: "",
    preferred_date: addDays(1),
    preferred_time: "10:00",
    comment: ""
  });
  const [submitting, setSubmitting] = useState(false);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    await onSubmit(form);
    setSubmitting(false);
  };

  return (
    <form className="panel lead-form" id="booking-form" onSubmit={handleSubmit}>
      <div className="section-heading tight">
        <div>
          <p className="eyebrow">Новая запись</p>
          <h2>Запись на прием</h2>
        </div>
        <CalendarDays size={24} aria-hidden="true" />
      </div>

      <div className="form-grid two">
        <Field
          label="Фамилия"
          required
          value={form.last_name}
          onChange={(value) => update("last_name", value)}
        />
        <Field
          label="Имя"
          required
          value={form.first_name}
          onChange={(value) => update("first_name", value)}
        />
        <DateField
          label="Дата рождения"
          value={form.birth_date}
          onChange={(value) => update("birth_date", value)}
        />
        <DateField
          label="Желаемая дата"
          required
          value={form.preferred_date}
          onChange={(value) => update("preferred_date", value)}
        />
        <TimeSelect
          label="Желаемое время"
          required
          value={form.preferred_time}
          onChange={(value) => update("preferred_time", value)}
        />
      </div>

      <Textarea
        label="Комментарий"
        value={form.comment}
        onChange={(value) => update("comment", value)}
        placeholder="Например: болит зуб, нужен осмотр"
      />

      <Button icon={UserPlus} disabled={submitting} type="submit" fullWidth>
        {submitting ? "Открываем..." : "Продолжить регистрацию"}
      </Button>
    </form>
  );
}

function Dashboard({
  currentUser,
  workspace,
  loading,
  draft,
  onClearDraft,
  onReload,
  notify
}) {
  const visibleAppointments = useMemo(() => {
    if (currentUser.role === "patient") {
      return workspace.appointments.filter(
        (item) => item.patient_id === currentUser.patient_id
      );
    }
    if (currentUser.role === "doctor") {
      return workspace.appointments.filter(
        (item) => item.doctor_id === currentUser.employee_id
      );
    }
    return workspace.appointments;
  }, [currentUser, workspace.appointments]);
  const displayName = getUserDisplayName(currentUser, workspace);

  return (
    <main className="dashboard">
      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">Личный кабинет</p>
          <h1>{ROLE_LABELS[currentUser.role] || currentUser.role}</h1>
          <p>{displayName}</p>
        </div>
        <Button variant="secondary" icon={RefreshCw} onClick={onReload}>
          Обновить
        </Button>
      </section>

      {loading && <div className="inline-loader">Загружаем данные...</div>}

      {currentUser.role === "patient" && (
        <PatientDashboard
          currentUser={currentUser}
          workspace={workspace}
          appointments={visibleAppointments}
          draft={draft}
          onClearDraft={onClearDraft}
          onReload={onReload}
          notify={notify}
        />
      )}
      {currentUser.role === "doctor" && (
        <DoctorDashboard
          currentUser={currentUser}
          workspace={workspace}
          appointments={visibleAppointments}
          onReload={onReload}
          notify={notify}
        />
      )}
      {currentUser.role === "registrar" && (
        <RegistrarDashboard
          currentUser={currentUser}
          workspace={workspace}
          appointments={visibleAppointments}
          onReload={onReload}
          notify={notify}
        />
      )}
      {currentUser.role === "admin" && (
        <AdminDashboard
          currentUser={currentUser}
          workspace={workspace}
          appointments={visibleAppointments}
          onReload={onReload}
          notify={notify}
        />
      )}
    </main>
  );
}

function PatientDashboard({
  currentUser,
  workspace,
  appointments,
  draft,
  onClearDraft,
  onReload,
  notify
}) {
  const [activeTab, setActiveTab] = useState("booking");
  const patientProfile = workspace.patients.find(
    (patient) => Number(patient.id) === Number(currentUser.patient_id)
  );
  const nextAppointment = appointments
    .filter((item) => ["scheduled", "moved"].includes(item.status))
    .sort(
      (a, b) =>
        new Date(a.appointment_start).getTime() -
        new Date(b.appointment_start).getTime()
    )[0];

  return (
    <>
      <section className="workspace-tabs" aria-label="Разделы кабинета пациента">
        <button
          className={activeTab === "booking" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("booking")}
        >
          Записаться
        </button>
        <button
          className={activeTab === "schedule" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("schedule")}
        >
          Мое расписание
        </button>
        <button
          className={activeTab === "profile" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("profile")}
        >
          Профиль
        </button>
      </section>

      {activeTab === "booking" ? (
        <section className="work-grid two">
          <AppointmentForm
            currentUser={currentUser}
            workspace={workspace}
            draft={draft}
            onClearDraft={onClearDraft}
            onCreated={onReload}
            notify={notify}
          />
          <PatientInfoPanel user={currentUser} nextAppointment={nextAppointment} />
        </section>
      ) : activeTab === "schedule" ? (
        <AppointmentList
          title="Мое расписание"
          appointments={appointments}
          currentUser={currentUser}
          onReload={onReload}
          notify={notify}
        />
      ) : (
        <section className="work-grid two">
          <PatientProfileForm
            patient={patientProfile}
            onUpdated={onReload}
            notify={notify}
          />
          <PatientInfoPanel user={currentUser} nextAppointment={nextAppointment} />
        </section>
      )}
    </>
  );
}

function DoctorDashboard({ currentUser, workspace, appointments, onReload, notify }) {
  const [activeTab, setActiveTab] = useState("visit");

  return (
    <>
      <section className="workspace-tabs role-tabs" aria-label="Разделы кабинета врача">
        <button
          className={activeTab === "visit" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("visit")}
        >
          Прием
        </button>
        <button
          className={activeTab === "schedule" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("schedule")}
        >
          Расписание
        </button>
      </section>

      {activeTab === "visit" ? (
        <section className="work-grid two">
          <VisitForm
            currentUser={currentUser}
            workspace={workspace}
            appointments={appointments}
            onCreated={onReload}
            notify={notify}
          />
          <DoctorTodayPanel appointments={appointments} />
        </section>
      ) : (
        <AppointmentList
          title="Мое расписание"
          appointments={appointments}
          currentUser={currentUser}
          onReload={onReload}
          notify={notify}
        />
      )}
    </>
  );
}

function RegistrarDashboard({
  currentUser,
  workspace,
  appointments,
  onReload,
  notify
}) {
  const [activeTab, setActiveTab] = useState("patients");

  return (
    <>
      <section className="workspace-tabs role-tabs" aria-label="Разделы кабинета регистратора">
        <button
          className={activeTab === "patients" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("patients")}
        >
          Пациенты
        </button>
        <button
          className={activeTab === "appointments" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("appointments")}
        >
          Записи
        </button>
        <button
          className={activeTab === "payments" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("payments")}
        >
          Оплаты
        </button>
      </section>

      {activeTab === "patients" && (
        <section className="work-grid two">
          <PatientCreateForm onCreated={onReload} notify={notify} />
          <PatientsPanel patients={workspace.patients} />
        </section>
      )}

      {activeTab === "appointments" && (
        <section className="work-grid two">
          <AppointmentForm
            currentUser={currentUser}
            workspace={workspace}
            onCreated={onReload}
            notify={notify}
          />
          <AppointmentList
            title="Записи клиники"
            appointments={appointments}
            currentUser={currentUser}
            onReload={onReload}
            notify={notify}
          />
        </section>
      )}

      {activeTab === "payments" && (
        <section className="work-grid two">
          <PaymentForm workspace={workspace} onCreated={onReload} notify={notify} />
          <PaymentsPanel payments={workspace.payments} />
        </section>
      )}
    </>
  );
}

function AdminDashboard({ currentUser, workspace, appointments, onReload, notify }) {
  const [activeTab, setActiveTab] = useState("overview");
  const tabs = [
    { id: "overview", label: "Обзор" },
    { id: "appointments", label: "Записи" },
    { id: "employees", label: "Сотрудники" },
    { id: "access", label: "Доступ" },
    { id: "services", label: "Услуги" },
    { id: "schedule", label: "Расписание" }
  ];

  return (
    <>
      <section className="workspace-tabs admin-tabs" aria-label="Разделы кабинета администратора">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </section>

      {activeTab === "overview" && <AdminReports workspace={workspace} />}

      {activeTab === "appointments" && (
        <section className="work-grid two">
          <AppointmentForm
            currentUser={currentUser}
            workspace={workspace}
            onCreated={onReload}
            notify={notify}
          />
          <AppointmentList
            title="Контроль записей"
            appointments={appointments}
            currentUser={currentUser}
            onReload={onReload}
            notify={notify}
          />
        </section>
      )}

      {activeTab === "employees" && (
        <section className="work-grid two">
          <EmployeeForm onCreated={onReload} notify={notify} />
          <EmployeesPanel employees={workspace.employees} />
        </section>
      )}

      {activeTab === "access" && (
        <section className="work-grid two">
          <UserAccessForm workspace={workspace} onCreated={onReload} notify={notify} />
          <UsersPanel users={workspace.users} onUpdated={onReload} notify={notify} />
        </section>
      )}

      {activeTab === "services" && (
        <section className="work-grid two">
          <ServiceForm onCreated={onReload} notify={notify} />
          <ServicesPanel services={workspace.services} />
        </section>
      )}

      {activeTab === "schedule" && (
        <section className="work-grid two">
          <ScheduleForm workspace={workspace} onCreated={onReload} notify={notify} />
          <SchedulesPanel schedules={workspace.schedules} />
        </section>
      )}
    </>
  );
}

function AppointmentForm({
  currentUser,
  workspace,
  draft,
  onClearDraft,
  onCreated,
  notify
}) {
  const [form, setForm] = useState({
    patient_id: currentUser.role === "patient" ? currentUser.patient_id || "" : "",
    doctor_id: currentUser.role === "doctor" ? currentUser.employee_id || "" : "",
    room_id: "",
    service_id: "",
    date: draft?.date || addDays(1),
    time: draft?.time || "10:00",
    comment: draft?.comment || ""
  });
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const doctors = useMemo(() => getDoctors(workspace.employees), [workspace.employees]);
  const services = useMemo(() => getActive(workspace.services), [workspace.services]);
  const rooms = useMemo(() => getActive(workspace.rooms), [workspace.rooms]);

  useEffect(() => {
    if (!draft) return;
    setForm((prev) => ({
      ...prev,
      date: draft.date || prev.date,
      time: draft.time || prev.time,
      comment: draft.comment || prev.comment
    }));
  }, [draft]);

  useEffect(() => {
    let cancelled = false;

    async function loadSlots() {
      if (!form.doctor_id || !form.date) {
        setSlots([]);
        return;
      }

      setLoadingSlots(true);
      try {
        const data = await availableSlots(form.doctor_id, form.date);
        if (!cancelled) setSlots(data.slots || []);
      } catch (error) {
        if (!cancelled) setSlots([]);
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }

    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [form.doctor_id, form.date]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const selectedService = services.find(
    (service) => String(service.id) === String(form.service_id)
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.patient_id) {
      notify("error", "Выберите пациента");
      return;
    }
    if (!form.doctor_id) {
      notify("error", "Выберите врача");
      return;
    }

    setSubmitting(true);
    try {
      await createAppointment({
        patient_id: Number(form.patient_id),
        doctor_id: Number(form.doctor_id),
        room_id: form.room_id ? Number(form.room_id) : null,
        service_id: form.service_id ? Number(form.service_id) : null,
        appointment_start: toApiDateTime(form.date, form.time),
        appointment_end: addMinutes(
          form.date,
          form.time,
          selectedService?.duration_minutes || 30
        ),
        comment: form.comment
      });
      notify("success", "Запись создана");
      setForm((prev) => ({
        ...prev,
        service_id: "",
        room_id: "",
        time: "10:00",
        comment: ""
      }));
      onClearDraft?.();
      await onCreated?.();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="section-heading tight">
        <div>
          <p className="eyebrow">Запись</p>
          <h2>Запись на прием</h2>
        </div>
        <CalendarDays size={24} aria-hidden="true" />
      </div>

      <div className="form-grid two">
        {currentUser.role !== "patient" && (
          <Select
            label="Пациент"
            required
            value={form.patient_id}
            onChange={(value) => update("patient_id", value)}
            options={workspace.patients.map((patient) => ({
              value: patient.id,
              label: `${fullName(patient)} · ${patient.phone}`
            }))}
          />
        )}
        <Select
          label="Врач"
          required
          value={form.doctor_id}
          onChange={(value) => update("doctor_id", value)}
          options={doctors.map((doctor) => ({
            value: doctor.id,
            label: `${fullName(doctor)} · ${doctor.position}`
          }))}
        />
        <Select
          label="Услуга"
          value={form.service_id}
          onChange={(value) => update("service_id", value)}
          options={services.map((service) => ({
            value: service.id,
            label: `${service.name} · ${formatMoney(service.price)}`
          }))}
        />
        <Select
          label="Кабинет"
          value={form.room_id}
          onChange={(value) => update("room_id", value)}
          options={rooms.map((room) => ({
            value: room.id,
            label: `${room.name}${room.floor ? ` · ${room.floor} этаж` : ""}`
          }))}
        />
        <DateField
          label="Дата"
          required
          value={form.date}
          onChange={(value) => update("date", value)}
        />
        <TimeSelect
          label="Время"
          required
          value={form.time}
          onChange={(value) => update("time", value)}
        />
      </div>

      <SlotPicker
        slots={slots}
        loading={loadingSlots}
        selectedTime={form.time}
        onSelect={(slot) => update("time", toInputTime(slot))}
      />

      <Textarea
        label="Комментарий"
        value={form.comment}
        onChange={(value) => update("comment", value)}
        placeholder="Коротко о причине визита"
      />

      <Button icon={Plus} type="submit" disabled={submitting} fullWidth>
        {submitting ? "Записываем..." : "Записаться на прием"}
      </Button>
    </form>
  );
}

function SlotPicker({ slots, loading, selectedTime, onSelect }) {
  if (loading) {
    return <p className="muted small">Проверяем свободные окна...</p>;
  }

  if (!slots.length) {
    return <p className="muted small">Свободные окна появятся после выбора врача и даты.</p>;
  }

  return (
    <div className="slot-list" aria-label="Свободные окна">
      {slots.slice(0, 12).map((slot) => {
        const time = toInputTime(slot);
        return (
          <button
            className={`slot-button ${selectedTime === time ? "active" : ""}`}
            key={slot}
            type="button"
            onClick={() => onSelect(slot)}
          >
            {time}
          </button>
        );
      })}
    </div>
  );
}

function PatientCreateForm({ onCreated, notify }) {
  const [form, setForm] = useState({
    last_name: "",
    first_name: "",
    middle_name: "",
    birth_date: "",
    phone: "",
    email: "",
    address: "",
    medical_notes: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createPatient(form);
      notify("success", "Пациент добавлен");
      setForm({
        last_name: "",
        first_name: "",
        middle_name: "",
        birth_date: "",
        phone: "",
        email: "",
        address: "",
        medical_notes: ""
      });
      await onCreated?.();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <FormTitle eyebrow="Регистратура" title="Новый пациент" icon={Users} />
      <div className="form-grid two">
        <Field label="Фамилия" required value={form.last_name} onChange={(value) => update("last_name", value)} />
        <Field label="Имя" required value={form.first_name} onChange={(value) => update("first_name", value)} />
        <Field label="Отчество" value={form.middle_name} onChange={(value) => update("middle_name", value)} />
        <DateField label="Дата рождения" value={form.birth_date} onChange={(value) => update("birth_date", value)} />
        <Field label="Телефон" required value={form.phone} onChange={(value) => update("phone", value)} />
        <Field label="Email" type="email" value={form.email} onChange={(value) => update("email", value)} />
      </div>
      <Textarea label="Адрес и заметки" value={form.address} onChange={(value) => update("address", value)} />
      <Button icon={Plus} type="submit" disabled={submitting} fullWidth>
        {submitting ? "Сохраняем..." : "Добавить пациента"}
      </Button>
    </form>
  );
}

function EmployeeForm({ onCreated, notify }) {
  const [form, setForm] = useState({
    last_name: "",
    first_name: "",
    middle_name: "",
    position: "",
    phone: "",
    email: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createEmployee(form);
      notify("success", "Сотрудник добавлен");
      setForm({
        last_name: "",
        first_name: "",
        middle_name: "",
        position: "",
        phone: "",
        email: ""
      });
      await onCreated?.();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <FormTitle eyebrow="Администрирование" title="Сотрудник" icon={ShieldCheck} />
      <div className="form-grid two">
        <Field label="Фамилия" required value={form.last_name} onChange={(value) => update("last_name", value)} />
        <Field label="Имя" required value={form.first_name} onChange={(value) => update("first_name", value)} />
        <Field label="Отчество" value={form.middle_name} onChange={(value) => update("middle_name", value)} />
        <Field label="Должность" required value={form.position} onChange={(value) => update("position", value)} />
        <Field label="Телефон" value={form.phone} onChange={(value) => update("phone", value)} />
        <Field label="Email" type="email" value={form.email} onChange={(value) => update("email", value)} />
      </div>
      <Button icon={Plus} type="submit" disabled={submitting} fullWidth>
        {submitting ? "Сохраняем..." : "Добавить сотрудника"}
      </Button>
    </form>
  );
}

function UserAccessForm({ workspace, onCreated, notify }) {
  const [form, setForm] = useState({
    employee_id: "",
    role: "doctor",
    login: "",
    password: "",
    is_active: true
  });
  const [submitting, setSubmitting] = useState(false);
  const employees = workspace.employees.filter((employee) => employee.is_active !== false);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const selectEmployee = (employeeId) => {
    const employee = employees.find((item) => String(item.id) === String(employeeId));
    setForm((prev) => ({
      ...prev,
      employee_id: employeeId,
      login: prev.login || employee?.email || ""
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createUser({
        employee_id: Number(form.employee_id),
        role: form.role,
        login: form.login,
        password: form.password,
        is_active: form.is_active
      });
      notify("success", "Учетная запись создана");
      setForm({
        employee_id: "",
        role: "doctor",
        login: "",
        password: "",
        is_active: true
      });
      await onCreated?.();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <FormTitle eyebrow="Доступ" title="Учетная запись" icon={ShieldCheck} />
      <Select
        label="Сотрудник"
        required
        value={form.employee_id}
        onChange={selectEmployee}
        options={employees.map((employee) => ({
          value: employee.id,
          label: `${fullName(employee)} · ${employee.position}`
        }))}
      />
      <div className="form-grid two">
        <Select
          label="Роль"
          required
          value={form.role}
          onChange={(value) => update("role", value)}
          options={STAFF_ROLE_OPTIONS}
        />
        <Field
          label="Логин"
          required
          value={form.login}
          onChange={(value) => update("login", value)}
        />
        <Field
          label="Пароль"
          type="password"
          required
          minLength={6}
          value={form.password}
          onChange={(value) => update("password", value)}
        />
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(event) => update("is_active", event.target.checked)}
        />
        Пользователь активен
      </label>
      <Button icon={Plus} type="submit" disabled={submitting} fullWidth>
        {submitting ? "Создаем..." : "Создать доступ"}
      </Button>
    </form>
  );
}

function ServiceForm({ onCreated, notify }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    duration_minutes: "30"
  });
  const [submitting, setSubmitting] = useState(false);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createService({
        ...form,
        price: Number(form.price),
        duration_minutes: Number(form.duration_minutes)
      });
      notify("success", "Услуга добавлена");
      setForm({ name: "", description: "", price: "", duration_minutes: "30" });
      await onCreated?.();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <FormTitle eyebrow="Прайс" title="Услуга" icon={ClipboardList} />
      <div className="form-grid two">
        <Field label="Название" required value={form.name} onChange={(value) => update("name", value)} />
        <Field label="Цена" type="number" required value={form.price} onChange={(value) => update("price", value)} />
        <Field label="Длительность, мин" type="number" required value={form.duration_minutes} onChange={(value) => update("duration_minutes", value)} />
      </div>
      <Textarea label="Описание" value={form.description} onChange={(value) => update("description", value)} />
      <Button icon={Plus} type="submit" disabled={submitting} fullWidth>
        {submitting ? "Сохраняем..." : "Добавить услугу"}
      </Button>
    </form>
  );
}

function ScheduleForm({ workspace, onCreated, notify }) {
  const [form, setForm] = useState({
    doctor_id: "",
    room_id: "",
    work_date: addDays(1),
    start_time: "09:00",
    end_time: "18:00",
    is_available: true
  });
  const [submitting, setSubmitting] = useState(false);
  const doctors = useMemo(() => getDoctors(workspace.employees), [workspace.employees]);
  const rooms = useMemo(() => getActive(workspace.rooms), [workspace.rooms]);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createDoctorSchedule({
        doctor_id: Number(form.doctor_id),
        room_id: form.room_id ? Number(form.room_id) : null,
        work_date: form.work_date,
        start_time: form.start_time,
        end_time: form.end_time,
        is_available: form.is_available
      });
      notify("success", "Расписание добавлено");
      await onCreated?.();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <FormTitle eyebrow="Расписание" title="Смена врача" icon={Clock} />
      <div className="form-grid two">
        <Select
          label="Врач"
          required
          value={form.doctor_id}
          onChange={(value) => update("doctor_id", value)}
          options={doctors.map((doctor) => ({ value: doctor.id, label: fullName(doctor) }))}
        />
        <Select
          label="Кабинет"
          value={form.room_id}
          onChange={(value) => update("room_id", value)}
          options={rooms.map((room) => ({ value: room.id, label: room.name }))}
        />
        <DateField label="Дата" required value={form.work_date} onChange={(value) => update("work_date", value)} />
        <TimeSelect label="Начало" required value={form.start_time} onChange={(value) => update("start_time", value)} />
        <TimeSelect label="Конец" required value={form.end_time} onChange={(value) => update("end_time", value)} />
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={form.is_available}
          onChange={(event) => update("is_available", event.target.checked)}
        />
        Врач доступен для записи
      </label>
      <Button icon={Plus} type="submit" disabled={submitting} fullWidth>
        {submitting ? "Сохраняем..." : "Добавить смену"}
      </Button>
    </form>
  );
}

function VisitForm({ currentUser, workspace, appointments, onCreated, notify }) {
  const [appointmentId, setAppointmentId] = useState("");
  const [serviceIds, setServiceIds] = useState([]);
  const [form, setForm] = useState({
    diagnosis: "",
    result: "",
    doctor_comment: ""
  });
  const [submitting, setSubmitting] = useState(false);

  const activeAppointments = appointments.filter((appointment) =>
    ["scheduled", "moved"].includes(appointment.status)
  );
  const selectedAppointment = activeAppointments.find(
    (appointment) => String(appointment.id) === String(appointmentId)
  );
  const services = getActive(workspace.services);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const toggleService = (id) => {
    setServiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedAppointment) {
      notify("error", "Выберите запись");
      return;
    }

    setSubmitting(true);
    try {
      await createVisit({
        appointment_id: Number(selectedAppointment.id),
        doctor_id: Number(selectedAppointment.doctor_id || currentUser.employee_id),
        patient_id: Number(selectedAppointment.patient_id),
        diagnosis: form.diagnosis,
        result: form.result,
        doctor_comment: form.doctor_comment,
        service_ids: serviceIds
      });
      notify("success", "Прием завершен");
      setAppointmentId("");
      setServiceIds([]);
      setForm({ diagnosis: "", result: "", doctor_comment: "" });
      await onCreated?.();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <FormTitle eyebrow="Врач" title="Завершить прием" icon={Stethoscope} />
      <Select
        label="Запись"
        required
        value={appointmentId}
        onChange={setAppointmentId}
        options={activeAppointments.map((appointment) => ({
          value: appointment.id,
          label: `${formatDateTime(appointment.appointment_start)} · ${appointment.patient_name}`
        }))}
      />
      <Textarea label="Диагноз" value={form.diagnosis} onChange={(value) => update("diagnosis", value)} />
      <Textarea label="Результат" value={form.result} onChange={(value) => update("result", value)} />
      <Textarea label="Комментарий врача" value={form.doctor_comment} onChange={(value) => update("doctor_comment", value)} />
      <div className="checkbox-list">
        {services.slice(0, 6).map((service) => (
          <label key={service.id} className="check-row">
            <input
              type="checkbox"
              checked={serviceIds.includes(service.id)}
              onChange={() => toggleService(service.id)}
            />
            {service.name}
          </label>
        ))}
      </div>
      <Button icon={CheckCircle2} type="submit" disabled={submitting} fullWidth>
        {submitting ? "Сохраняем..." : "Завершить прием"}
      </Button>
    </form>
  );
}

function PaymentForm({ workspace, onCreated, notify }) {
  const [form, setForm] = useState({
    visit_id: "",
    amount: "",
    payment_method: "card",
    status: "paid"
  });
  const [submitting, setSubmitting] = useState(false);
  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createPayment({
        visit_id: Number(form.visit_id),
        amount: Number(form.amount),
        payment_method: form.payment_method,
        status: form.status
      });
      notify("success", "Платеж добавлен");
      setForm({ visit_id: "", amount: "", payment_method: "card", status: "paid" });
      await onCreated?.();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <FormTitle eyebrow="Оплата" title="Новый платеж" icon={CreditCard} />
      <Select
        label="Прием"
        required
        value={form.visit_id}
        onChange={(value) => update("visit_id", value)}
        options={workspace.visits.map((visit) => ({
          value: visit.id,
          label: `${formatDateTime(visit.visit_date)} · ${visit.patient_name}`
        }))}
      />
      <div className="form-grid two">
        <Field label="Сумма" type="number" required value={form.amount} onChange={(value) => update("amount", value)} />
        <Select
          label="Способ"
          value={form.payment_method}
          onChange={(value) => update("payment_method", value)}
          options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }))}
        />
        <Select
          label="Статус"
          value={form.status}
          onChange={(value) => update("status", value)}
          options={Object.entries(PAYMENT_STATUSES).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <Button icon={Plus} type="submit" disabled={submitting} fullWidth>
        {submitting ? "Сохраняем..." : "Добавить платеж"}
      </Button>
    </form>
  );
}

function AppointmentList({ title, appointments, currentUser, onReload, notify }) {
  const [updatingId, setUpdatingId] = useState(null);

  const updateStatus = async (id, status) => {
    setUpdatingId(id);
    try {
      await patchAppointment(id, { status });
      notify("success", "Статус записи обновлен");
      await onReload?.();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="panel list-panel">
      <div className="section-heading tight">
        <div>
          <p className="eyebrow">Расписание</p>
          <h2>{title}</h2>
        </div>
        <span className="count-badge">{appointments.length}</span>
      </div>

      {appointments.length === 0 ? (
        <EmptyState icon={CalendarDays} text="Записей пока нет" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Пациент</th>
                <th>Врач</th>
                <th>Услуга</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appointment) => (
                <tr key={appointment.id}>
                  <td>{formatDateTime(appointment.appointment_start)}</td>
                  <td>{appointment.patient_name}</td>
                  <td>{appointment.doctor_name}</td>
                  <td>{appointment.service_name || "Не указана"}</td>
                  <td>
                    <span className={`status status-${appointment.status}`}>
                      {STATUS_LABELS[appointment.status] || appointment.status}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      {["admin", "registrar", "doctor"].includes(currentUser.role) &&
                        appointment.status !== "completed" && (
                          <IconButton
                            title="Завершить"
                            icon={CheckCircle2}
                            disabled={updatingId === appointment.id}
                            onClick={() => updateStatus(appointment.id, "completed")}
                          />
                        )}
                      {appointment.status !== "cancelled" && (
                        <IconButton
                          title="Отменить"
                          icon={XCircle}
                          disabled={updatingId === appointment.id}
                          onClick={() => updateStatus(appointment.id, "cancelled")}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PatientProfileForm({ patient, onUpdated, notify }) {
  const [form, setForm] = useState({
    last_name: patient?.last_name || "",
    first_name: patient?.first_name || "",
    middle_name: patient?.middle_name || "",
    birth_date: patient?.birth_date || "",
    phone: patient?.phone || "",
    email: patient?.email || "",
    address: patient?.address || "",
    medical_notes: patient?.medical_notes || ""
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!patient) return;
    setForm({
      last_name: patient.last_name || "",
      first_name: patient.first_name || "",
      middle_name: patient.middle_name || "",
      birth_date: patient.birth_date || "",
      phone: patient.phone || "",
      email: patient.email || "",
      address: patient.address || "",
      medical_notes: patient.medical_notes || ""
    });
  }, [patient]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!patient?.id) {
      notify("error", "Профиль пациента еще не загружен");
      return;
    }

    setSubmitting(true);
    try {
      await updatePatient(patient.id, form);
      notify("success", "Профиль обновлен");
      await onUpdated?.();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <FormTitle eyebrow="Профиль" title="Мои данные" icon={Users} />
      <div className="form-grid two">
        <Field label="Фамилия" required value={form.last_name} onChange={(value) => update("last_name", value)} />
        <Field label="Имя" required value={form.first_name} onChange={(value) => update("first_name", value)} />
        <Field label="Отчество" value={form.middle_name} onChange={(value) => update("middle_name", value)} />
        <DateField label="Дата рождения" value={form.birth_date} onChange={(value) => update("birth_date", value)} />
        <Field label="Телефон" required value={form.phone} onChange={(value) => update("phone", value)} />
        <Field label="Email" type="email" value={form.email} onChange={(value) => update("email", value)} />
      </div>
      <Field label="Адрес" value={form.address} onChange={(value) => update("address", value)} />
      <Textarea
        label="Медицинские заметки"
        value={form.medical_notes}
        onChange={(value) => update("medical_notes", value)}
      />
      <Button icon={CheckCircle2} type="submit" disabled={submitting} fullWidth>
        {submitting ? "Сохраняем..." : "Сохранить данные"}
      </Button>
    </form>
  );
}

function PatientInfoPanel({ user, nextAppointment }) {
  return (
    <section className="panel accent-panel">
      <FormTitle eyebrow="Пациент" title="Мой кабинет" icon={Users} />
      <dl className="details-list">
        <div>
          <dt>Email для входа</dt>
          <dd>{user.login}</dd>
        </div>
        <div>
          <dt>Следующий прием</dt>
          <dd>
            {nextAppointment
              ? `${formatDateTime(nextAppointment.appointment_start)} · ${nextAppointment.doctor_name}`
              : "Запись не выбрана"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function DoctorTodayPanel({ appointments }) {
  const todayItems = appointments.filter((item) =>
    String(item.appointment_start || "").startsWith(todayDate())
  );

  return (
    <section className="panel accent-panel">
      <FormTitle eyebrow="Сегодня" title="Приемы врача" icon={Activity} />
      {todayItems.length === 0 ? (
        <EmptyState icon={Clock} text="На сегодня записей нет" />
      ) : (
        <div className="timeline">
          {todayItems.map((appointment) => (
            <div className="timeline-item" key={appointment.id}>
              <time>{formatDateTime(appointment.appointment_start)}</time>
              <strong>{appointment.patient_name}</strong>
              <span>{appointment.service_name || "Услуга не указана"}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PatientsPanel({ patients }) {
  return (
    <section className="panel list-panel">
      <div className="section-heading tight">
        <div>
          <p className="eyebrow">Пациенты</p>
          <h2>База пациентов</h2>
        </div>
        <Search size={22} aria-hidden="true" />
      </div>
      {patients.length === 0 ? (
        <EmptyState icon={Users} text="Пациенты не найдены" />
      ) : (
        <div className="compact-list">
          {patients.slice(0, 8).map((patient) => (
            <article key={patient.id} className="compact-row">
              <div>
                <strong>{fullName(patient)}</strong>
                <span>{patient.phone}</span>
              </div>
              <span>{patient.email || "Без email"}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PaymentsPanel({ payments }) {
  return (
    <section className="panel list-panel">
      <div className="section-heading tight">
        <div>
          <p className="eyebrow">Оплаты</p>
          <h2>История платежей</h2>
        </div>
        <CreditCard size={22} aria-hidden="true" />
      </div>
      {payments.length === 0 ? (
        <EmptyState icon={CreditCard} text="Платежей пока нет" />
      ) : (
        <div className="compact-list">
          {payments.slice(0, 10).map((payment) => (
            <article key={payment.id} className="compact-row">
              <div>
                <strong>{formatMoney(payment.amount)}</strong>
                <span>{formatDateTime(payment.payment_date)}</span>
              </div>
              <span>
                {PAYMENT_METHODS[payment.payment_method] || payment.payment_method} ·{" "}
                {PAYMENT_STATUSES[payment.status] || payment.status}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EmployeesPanel({ employees }) {
  const activeEmployees = employees.filter((employee) => employee.is_active !== false);

  return (
    <section className="panel list-panel">
      <div className="section-heading tight">
        <div>
          <p className="eyebrow">Команда</p>
          <h2>Сотрудники</h2>
        </div>
        <ShieldCheck size={22} aria-hidden="true" />
      </div>
      {activeEmployees.length === 0 ? (
        <EmptyState icon={Users} text="Сотрудники не найдены" />
      ) : (
        <div className="compact-list">
          {activeEmployees.map((employee) => (
            <article key={employee.id} className="compact-row">
              <div>
                <strong>{fullName(employee)}</strong>
                <span>{employee.position}</span>
              </div>
              <span>{employee.phone || employee.email || "Контакты не указаны"}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function UsersPanel({ users, onUpdated, notify }) {
  const [updatingId, setUpdatingId] = useState(null);

  const saveUser = async (user, patch) => {
    setUpdatingId(user.id);
    try {
      await updateUser(user.id, {
        login: user.login,
        role: patch.role || user.role,
        employee_id: user.employee_id,
        patient_id: user.patient_id,
        is_active:
          typeof patch.is_active === "boolean" ? patch.is_active : user.is_active
      });
      notify("success", "Права пользователя обновлены");
      await onUpdated?.();
    } catch (error) {
      notify("error", readableError(error));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section className="panel list-panel">
      <div className="section-heading tight">
        <div>
          <p className="eyebrow">Права</p>
          <h2>Пользователи</h2>
        </div>
        <ShieldCheck size={22} aria-hidden="true" />
      </div>
      {users.length === 0 ? (
        <EmptyState icon={ShieldCheck} text="Пользователи не найдены" />
      ) : (
        <div className="compact-list">
          {users.map((user) => {
            const profileName = user.employee_name || user.patient_name || user.login;
            const canChangeRole = Boolean(user.employee_id);

            return (
              <article key={user.id} className="compact-row access-row">
                <div>
                  <strong>{profileName}</strong>
                  <span>{user.login}</span>
                </div>
                <div className="access-controls">
                  {canChangeRole ? (
                    <select
                      value={user.role}
                      disabled={updatingId === user.id}
                      onChange={(event) => saveUser(user, { role: event.target.value })}
                    >
                      {STAFF_ROLE_OPTIONS.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="status status-moved">
                      {ROLE_LABELS[user.role] || user.role}
                    </span>
                  )}
                  <label className="mini-check">
                    <input
                      type="checkbox"
                      checked={user.is_active}
                      disabled={updatingId === user.id}
                      onChange={(event) =>
                        saveUser(user, { is_active: event.target.checked })
                      }
                    />
                    Активен
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ServicesPanel({ services }) {
  const activeServices = getActive(services);

  return (
    <section className="panel list-panel">
      <div className="section-heading tight">
        <div>
          <p className="eyebrow">Прайс</p>
          <h2>Услуги</h2>
        </div>
        <ClipboardList size={22} aria-hidden="true" />
      </div>
      {activeServices.length === 0 ? (
        <EmptyState icon={ClipboardList} text="Услуги не найдены" />
      ) : (
        <div className="compact-list">
          {activeServices.map((service) => (
            <article key={service.id} className="compact-row">
              <div>
                <strong>{service.name}</strong>
                <span>{service.duration_minutes} мин</span>
              </div>
              <span>{formatMoney(service.price)}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SchedulesPanel({ schedules }) {
  return (
    <section className="panel list-panel">
      <div className="section-heading tight">
        <div>
          <p className="eyebrow">Расписание</p>
          <h2>Смены врачей</h2>
        </div>
        <Clock size={22} aria-hidden="true" />
      </div>
      {schedules.length === 0 ? (
        <EmptyState icon={Clock} text="Смены еще не добавлены" />
      ) : (
        <div className="compact-list">
          {schedules.slice(0, 10).map((schedule) => (
            <article key={schedule.id} className="compact-row">
              <div>
                <strong>{schedule.doctor_name}</strong>
                <span>
                  {formatDate(schedule.work_date)} · {schedule.start_time} - {schedule.end_time}
                </span>
              </div>
              <span>{schedule.room_name || "Кабинет не указан"}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AdminReports({ workspace }) {
  const reports = workspace.reports;
  const revenue = reports.revenue?.total_revenue || 0;
  const appointmentCount = reports.appointmentsCount?.appointments_count || 0;

  return (
    <section className="report-grid">
      <MetricCard icon={CreditCard} label="Выручка" value={formatMoney(revenue)} />
      <MetricCard icon={CalendarDays} label="Всего записей" value={appointmentCount} />
      <section className="panel report-panel">
        <FormTitle eyebrow="Нагрузка" title="Врачи" icon={Activity} />
        {reports.doctorLoad.length === 0 ? (
          <EmptyState icon={Activity} text="Данных для отчета пока нет" />
        ) : (
          <div className="bar-list">
            {reports.doctorLoad.map((item) => (
              <div key={item.doctor_id} className="bar-row">
                <span>{item.doctor_name}</span>
                <div className="bar-track">
                  <i style={{ width: `${Math.min(item.appointments_count * 18, 100)}%` }} />
                </div>
                <strong>{item.appointments_count}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="panel report-panel">
        <FormTitle eyebrow="Статусы" title="Записи" icon={ClipboardList} />
        {reports.appointmentStatuses.length === 0 ? (
          <EmptyState icon={ClipboardList} text="Статусы еще не появились" />
        ) : (
          <div className="status-cloud">
            {reports.appointmentStatuses.map((item) => (
              <span className={`status status-${item.status}`} key={item.status}>
                {STATUS_LABELS[item.status] || item.status}: {item.count}
              </span>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function AuthDialog({ initialMode, initialRegisterData, onClose, onSuccess }) {
  const [mode, setMode] = useState(initialMode);
  const [loginForm, setLoginForm] = useState({ identifier: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    last_name: initialRegisterData?.last_name || "",
    first_name: initialRegisterData?.first_name || "",
    birth_date: initialRegisterData?.birth_date || "",
    email: "",
    address: "",
    medical_notes: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submitLogin = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const payload = await authLogin({
        login: loginForm.identifier,
        email: loginForm.identifier,
        password: loginForm.password
      });
      onSuccess(payload);
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  const submitRegister = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const payload = await registerPatient({
        ...registerForm,
        middle_name: registerForm.middle_name || "",
        phone: registerForm.phone || "Не указан"
      });
      onSuccess(payload);
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="auth-modal">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть">
          <X size={20} aria-hidden="true" />
        </button>
        <div className="segmented">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Регистрация
          </button>
        </div>

        {error && <div className="form-error">{error}</div>}

        {mode === "login" ? (
          <form className="auth-form" onSubmit={submitLogin}>
            <FormTitle eyebrow="Кабинет" title="Вход" icon={LogIn} />
            <Field
              label="Логин или email"
              required
              autoComplete="username"
              value={loginForm.identifier}
              onChange={(value) => setLoginForm((prev) => ({ ...prev, identifier: value }))}
            />
            <Field
              label="Пароль"
              type="password"
              required
              value={loginForm.password}
              onChange={(value) => setLoginForm((prev) => ({ ...prev, password: value }))}
            />
            <Button icon={LogIn} disabled={submitting} type="submit" fullWidth>
              {submitting ? "Входим..." : "Войти"}
            </Button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={submitRegister}>
            <FormTitle eyebrow="Пациент" title="Регистрация" icon={UserPlus} />
            <div className="form-grid two">
              <Field label="Фамилия" required value={registerForm.last_name} onChange={(value) => setRegisterForm((prev) => ({ ...prev, last_name: value }))} />
              <Field label="Имя" required value={registerForm.first_name} onChange={(value) => setRegisterForm((prev) => ({ ...prev, first_name: value }))} />
              <DateField label="Дата рождения" value={registerForm.birth_date} onChange={(value) => setRegisterForm((prev) => ({ ...prev, birth_date: value }))} />
              <Field label="Email" type="email" required value={registerForm.email} onChange={(value) => setRegisterForm((prev) => ({ ...prev, email: value }))} />
              <Field label="Пароль" type="password" required minLength={6} value={registerForm.password} onChange={(value) => setRegisterForm((prev) => ({ ...prev, password: value }))} />
            </div>
            <Button icon={UserPlus} disabled={submitting} type="submit" fullWidth>
              {submitting ? "Создаем..." : "Создать кабинет"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function FormTitle({ eyebrow, title, icon: Icon }) {
  return (
    <div className="section-heading tight">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <Icon size={24} aria-hidden="true" />
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, ...rest }) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      <input
        {...rest}
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DateField({ label, value, onChange, required }) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      <input
        required={required}
        type="text"
        inputMode="numeric"
        placeholder="дд.мм.гггг"
        pattern="\d{2}\.\d{2}\.\d{4}"
        value={formatRuDateInput(value)}
        onChange={(event) => onChange(parseRuDateInput(event.target.value))}
      />
    </label>
  );
}

function TimeSelect({ label, value, onChange, required }) {
  return (
    <Select
      label={label}
      required={required}
      value={value}
      onChange={onChange}
      options={TIME_OPTIONS}
    />
  );
}

function Select({ label, value, onChange, options, required }) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Выберите</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Button({
  children,
  icon: Icon,
  variant = "primary",
  fullWidth = false,
  className = "",
  ...props
}) {
  return (
    <button
      {...props}
      className={`button button-${variant} ${fullWidth ? "full-width" : ""} ${className}`}
    >
      {Icon && <Icon size={18} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

function IconButton({ title, icon: Icon, ...props }) {
  return (
    <button className="icon-button" type="button" title={title} aria-label={title} {...props}>
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}

function MetricCard({ icon: Icon, label, value }) {
  return (
    <article className="metric-card">
      <Icon size={22} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="empty-state">
      <Icon size={24} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

function Toast({ notice, onClose }) {
  return (
    <div className={`toast toast-${notice.type}`}>
      <span>{notice.text}</span>
      <button type="button" onClick={onClose} aria-label="Закрыть уведомление">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="brand-mark">
        <Stethoscope size={24} aria-hidden="true" />
      </div>
      <p>Открываем кабинет...</p>
    </div>
  );
}

export default App;
