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
  TranscriptionResponse,
  LanguageOption,
  SessionTranscriptItem,
  SentimentAnalysisResult,
  EnrolledStudent,
  RegisteredStudent,
} from '../types';

const resolveApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const isRemote = window.location.hostname && 
                     window.location.hostname !== 'localhost' && 
                     window.location.hostname !== '127.0.0.1';

    // 1. Check URL query parameters: ?api_url=https://... or ?backend_url=https://...
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryApiUrl = urlParams.get('api_url') || urlParams.get('backend_url');
      if (queryApiUrl && queryApiUrl.trim()) {
        const cleaned = queryApiUrl.trim().replace(/\/+$/, '');
        const finalUrl = cleaned.endsWith('/api') ? cleaned : `${cleaned}/api`;
        localStorage.setItem('edusense_api_url', finalUrl);
        // Clean URL parameter without reloading
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('api_url');
        cleanUrl.searchParams.delete('backend_url');
        window.history.replaceState({}, document.title, cleanUrl.toString());
        return finalUrl;
      }
    } catch {
      // Ignore URL parsing errors
    }

    // 2. Check for manual local override in browser (allows switching backend tunnels on the fly)
    const localOverride = localStorage.getItem('edusense_api_url');
    if (localOverride && localOverride.trim()) {
      const trimmed = localOverride.trim().replace(/\/+$/, '');
      const isOverrideLocalhost = trimmed.includes('localhost') || trimmed.includes('127.0.0.1');
      // If we are on a remote PC, discard any old localhost override that may have been stored
      if (isRemote && isOverrideLocalhost) {
        try { localStorage.removeItem('edusense_api_url'); } catch {}
      } else {
        return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
      }
    }

    // 3. Check for environment variable VITE_API_BASE_URL or VITE_API_URL
    const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
    if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
      const trimmed = envUrl.trim().replace(/\/+$/, '');
      const isEnvLocalhost = trimmed.includes('localhost') || trimmed.includes('127.0.0.1');
      // If accessed from a remote device, ignore localhost environment variables!
      if (!isRemote || !isEnvLocalhost) {
        return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
      }
    }

    // 4. If accessed through external domain / ngrok without a separate backend URL specified,
    // use same-origin /api so requests are proxied by Vite to port 8000
    if (isRemote) {
      return '/api';
    }
  }

  // 5. Default to same-origin /api (proxied by Vite to port 8000)
  return '/api';
};

export const getApiBaseUrl = (): string => resolveApiBaseUrl();

export const API_BASE_URL = {
  toString: () => resolveApiBaseUrl(),
  valueOf: () => resolveApiBaseUrl(),
  [Symbol.toPrimitive]: () => resolveApiBaseUrl(),
} as unknown as string;

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('edusense_token');
  return {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
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
  const res = await fetch(`${API_BASE_URL}/health`, {
    headers: { 'ngrok-skip-browser-warning': 'true' },
  });
  return handleResponse<any>(res);
}

export const authApi = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse<AuthResponse>(res);
  },

  registerTeacher: async (data: any): Promise<User> => {
    const res = await fetch(`${API_BASE_URL}/auth/register/teacher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(data),
    });
    return handleResponse<User>(res);
  },

  registerStudent: async (data: any): Promise<User> => {
    const res = await fetch(`${API_BASE_URL}/auth/register/student`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
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

  createClassroom: async (data: {
    title: string;
    description?: string;
    course_code: string;
    department?: string;
    semester?: string;
  }): Promise<Classroom> => {
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

  listRegisteredStudents: async (): Promise<RegisteredStudent[]> => {
    const res = await fetch(`${API_BASE_URL}/classrooms/registered-students`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<RegisteredStudent[]>(res);
  },

  listEnrolledStudents: async (classroomId: string): Promise<EnrolledStudent[]> => {
    const res = await fetch(`${API_BASE_URL}/classrooms/${classroomId}/students`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<EnrolledStudent[]>(res);
  },

  enrollStudent: async (
    classroomId: string,
    data: { student_id?: string; student_id_number?: string }
  ): Promise<EnrolledStudent> => {
    const res = await fetch(`${API_BASE_URL}/classrooms/${classroomId}/enroll`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<EnrolledStudent>(res);
  },

  removeStudent: async (classroomId: string, studentId: string): Promise<{ detail: string }> => {
    const res = await fetch(`${API_BASE_URL}/classrooms/${classroomId}/students/${studentId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ detail: string }>(res);
  },

  joinCourse: async (courseCode: string): Promise<Classroom> => {
    const res = await fetch(`${API_BASE_URL}/classrooms/join`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ course_code: courseCode }),
    });
    return handleResponse<Classroom>(res);
  },

  listEnrolledCourses: async (): Promise<Classroom[]> => {
    const res = await fetch(`${API_BASE_URL}/classrooms/enrolled`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<Classroom[]>(res);
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

  getUpcomingSessions: async (): Promise<ClassSession[]> => {
    const res = await fetch(`${API_BASE_URL}/sessions/upcoming`, {
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

  exportAttendanceExcel: async (params?: {
    sessionId?: string;
    classroomId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ blob: Blob; filename: string }> => {
    const token = localStorage.getItem('edusense_token');
    const queryParams = new URLSearchParams();
    if (params?.sessionId) queryParams.append('session_id', params.sessionId);
    if (params?.classroomId) queryParams.append('classroom_id', params.classroomId);
    if (params?.startDate) queryParams.append('start_date', params.startDate);
    if (params?.endDate) queryParams.append('end_date', params.endDate);

    const queryString = queryParams.toString();
    const url = `${API_BASE_URL}/attendance/export${queryString ? `?${queryString}` : ''}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!res.ok) {
      let errorMessage = 'Failed to export attendance report';
      try {
        const errorData = await res.json();
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map((e: any) => e.msg).join(', ');
        }
      } catch {
        errorMessage = res.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    let filename = `EduSense_Present_Students_${new Date().toISOString().split('T')[0]}.xlsx`;
    const disposition = res.headers.get('content-disposition');
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, '').trim();
      }
    }

    const blob = await res.blob();
    return { blob, filename };
  },
};

export const triggerFileDownload = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

export const analyticsApi = {
  sampleFrame: async (data: { session_id: string; student_id?: string; image_base64?: string }): Promise<any> => {
    const res = await fetch(`${API_BASE_URL}/analytics/sample-frame`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<any>(res);
  },

  analyzeSentiment: async (data: { session_id: string; user_id?: string; text: string }): Promise<any> => {
    const res = await fetch(`${API_BASE_URL}/analytics/sentiment`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<any>(res);
  },

  getStudentEngagement: async (sessionId: string, studentId: string): Promise<any> => {
    const res = await fetch(`${API_BASE_URL}/analytics/session/${sessionId}/student/${studentId}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<any>(res);
  },

  getSessionOverview: async (sessionId: string): Promise<any> => {
    const res = await fetch(`${API_BASE_URL}/analytics/session/${sessionId}/overview`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<any>(res);
  },

  getClassroomFacialWindow: async (sessionId: string): Promise<any> => {
    const res = await fetch(`${API_BASE_URL}/analytics/session/${sessionId}/facial-window`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<any>(res);
  },

  getStudentFacialWindow: async (sessionId: string, studentId: string): Promise<any> => {
    const res = await fetch(`${API_BASE_URL}/analytics/session/${sessionId}/student/${studentId}/facial-window`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<any>(res);
  },

  getSessionFacialSummary: async (sessionId: string): Promise<any> => {
    const res = await fetch(`${API_BASE_URL}/analytics/session/${sessionId}/facial-summary`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<any>(res);
  },
};

export const transcriptionApi = {
  getLanguages: async (): Promise<LanguageOption[]> => {
    const res = await fetch(`${API_BASE_URL}/transcription/languages`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<LanguageOption[]>(res);
  },

  transcribeAudioFile: async (
    file: File,
    options?: { session_id?: string; language?: string; enrich_sentiment?: boolean }
  ): Promise<TranscriptionResponse> => {
    const token = localStorage.getItem('edusense_token');
    const formData = new FormData();
    formData.append('file', file);
    if (options?.session_id) formData.append('session_id', options.session_id);
    if (options?.language) formData.append('language', options.language);
    if (options?.enrich_sentiment !== undefined) {
      formData.append('enrich_sentiment', String(options.enrich_sentiment));
    }

    const res = await fetch(`${API_BASE_URL}/transcription/audio`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    return handleResponse<TranscriptionResponse>(res);
  },

  transcribeSnippet: async (data: {
    audio_base64: string;
    mime_type?: string;
    session_id?: string;
    language?: string;
    enrich_sentiment?: boolean;
  }): Promise<TranscriptionResponse> => {
    const res = await fetch(`${API_BASE_URL}/transcription/snippet`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<TranscriptionResponse>(res);
  },

  getSessionTranscripts: async (sessionId: string, limit: number = 50): Promise<SessionTranscriptItem[]> => {
    const res = await fetch(`${API_BASE_URL}/transcription/session/${sessionId}/history?limit=${limit}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<SessionTranscriptItem[]>(res);
  },

  analyzeTextSentiment: async (data: {
    text: string;
    language?: string;
  }): Promise<SentimentAnalysisResult> => {
    const res = await fetch(`${API_BASE_URL}/transcription/analyze-text`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<SentimentAnalysisResult>(res);
  },
};




