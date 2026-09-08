import type {
  AuthResponse,
  User,
  Classroom,
  ClassSession,
  JoinSessionResponse,
  FaceCaptureResponse,
  EnrollmentCompleteResponse,
  EnrollmentStatusResponse,
  FaceVerificationResponse,
  AttendanceVerificationResponse,
  SessionAttendanceSummaryResponse,
  AttendanceRecordResponse,
  StudentAttendanceSummaryResponse,
  TeacherAttendanceSummaryResponse,
} from '../types';

const API_BASE_URL = 'http://localhost:8000/api';

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('edusense_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
      const errorData = await response.json();
      if (typeof errorData.detail === 'string') {
        errorMessage = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        errorMessage = errorData.detail.map((e: any) => e.msg).join(', ');
      } else if (errorData.detail) {
        errorMessage = JSON.stringify(errorData.detail);
      }
    } catch {
      errorMessage = response.statusText;
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

export async function fetchHealthStatus(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/health`);
  return handleResponse<any>(res);
}

export const authApi = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse<AuthResponse>(res);
  },

  registerTeacher: async (data: any): Promise<User> => {
    const res = await fetch(`${API_BASE_URL}/auth/register/teacher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<User>(res);
  },

  registerStudent: async (data: any): Promise<User> => {
    const res = await fetch(`${API_BASE_URL}/auth/register/student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<User>(res);
  },

  getMe: async (): Promise<User> => {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<User>(res);
  },
};

export const classroomApi = {
  listClassrooms: async (): Promise<Classroom[]> => {
    const res = await fetch(`${API_BASE_URL}/classrooms/`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<Classroom[]>(res);
  },

  createClassroom: async (data: { title: string; description?: string; course_code: string }): Promise<Classroom> => {
    const res = await fetch(`${API_BASE_URL}/classrooms/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<Classroom>(res);
  },

  getClassroom: async (classId: string): Promise<Classroom> => {
    const res = await fetch(`${API_BASE_URL}/classrooms/${classId}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<Classroom>(res);
  },
};

export const sessionApi = {
  createSession: async (classId: string, data: { title: string }): Promise<ClassSession> => {
    const res = await fetch(`${API_BASE_URL}/classrooms/${classId}/sessions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<ClassSession>(res);
  },

  startSession: async (sessionId: string): Promise<ClassSession> => {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<ClassSession>(res);
  },

  endSession: async (sessionId: string): Promise<ClassSession> => {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<ClassSession>(res);
  },

  getSession: async (sessionId: string): Promise<ClassSession> => {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<ClassSession>(res);
  },

  getActiveSessionForClassroom: async (classId: string): Promise<ClassSession | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/classrooms/${classId}/active-session`, {
        headers: getAuthHeaders(),
      });
      if (res.status === 404) return null;
      return handleResponse<ClassSession>(res);
    } catch {
      return null;
    }
  },

  getRecentSessions: async (): Promise<ClassSession[]> => {
    const res = await fetch(`${API_BASE_URL}/sessions/recent`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<ClassSession[]>(res);
  },

  joinSession: async (classId: string, sessionId: string): Promise<JoinSessionResponse> => {
    const res = await fetch(`${API_BASE_URL}/classrooms/${classId}/sessions/${sessionId}/join`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<JoinSessionResponse>(res);
  },

  leaveSession: async (sessionId: string): Promise<{ message: string }> => {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/leave`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(res);
  },
};

export const faceApi = {
  captureSample: async (image_base64: string, pose_label?: string): Promise<FaceCaptureResponse> => {
    const res = await fetch(`${API_BASE_URL}/face/enrollment/capture`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ image_base64, pose_label }),
    });
    return handleResponse<FaceCaptureResponse>(res);
  },

  completeEnrollment: async (sample_embeddings: number[][], poses?: string[]): Promise<EnrollmentCompleteResponse> => {
    const res = await fetch(`${API_BASE_URL}/face/enrollment/complete`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ sample_embeddings, poses }),
    });
    return handleResponse<EnrollmentCompleteResponse>(res);
  },

  getEnrollmentStatus: async (): Promise<EnrollmentStatusResponse> => {
    const res = await fetch(`${API_BASE_URL}/face/enrollment/status`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<EnrollmentStatusResponse>(res);
  },

  deleteEnrollment: async (): Promise<{ message: string }> => {
    const res = await fetch(`${API_BASE_URL}/face/enrollment`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(res);
  },

  verifyFace: async (image_base64: string): Promise<FaceVerificationResponse> => {
    const res = await fetch(`${API_BASE_URL}/face/verification`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ image_base64 }),
    });
    return handleResponse<FaceVerificationResponse>(res);
  },
};

export const attendanceApi = {
  verifyAttendance: async (session_id: string, image_base64: string): Promise<AttendanceVerificationResponse> => {
    const res = await fetch(`${API_BASE_URL}/attendance/verify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ session_id, image_base64 }),
    });
    return handleResponse<AttendanceVerificationResponse>(res);
  },

  getSessionAttendance: async (session_id: string): Promise<SessionAttendanceSummaryResponse> => {
    const res = await fetch(`${API_BASE_URL}/attendance/session/${session_id}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<SessionAttendanceSummaryResponse>(res);
  },

  updateAttendanceRecord: async (record_id: string, status: string, reason?: string): Promise<AttendanceRecordResponse> => {
    const res = await fetch(`${API_BASE_URL}/attendance/${record_id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status, reason }),
    });
    return handleResponse<AttendanceRecordResponse>(res);
  },

  getStudentSummary: async (): Promise<StudentAttendanceSummaryResponse> => {
    const res = await fetch(`${API_BASE_URL}/attendance/my-summary`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<StudentAttendanceSummaryResponse>(res);
  },

  getTeacherSummary: async (): Promise<TeacherAttendanceSummaryResponse> => {
    const res = await fetch(`${API_BASE_URL}/attendance/teacher-summary`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<TeacherAttendanceSummaryResponse>(res);
  },
};



