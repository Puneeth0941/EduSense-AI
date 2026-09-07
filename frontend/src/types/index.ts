export type UserRole = 'TEACHER' | 'STUDENT' | 'ADMIN';

export type SessionStatus = 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface TeacherProfile {
  id: string;
  employee_id: string;
  department?: string;
  designation?: string;
}

export interface StudentProfile {
  id: string;
  student_id_number: string;
  department?: string;
  enrollment_year?: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  teacher_profile?: TeacherProfile;
  student_profile?: StudentProfile;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Classroom {
  id: string;
  title: string;
  description?: string;
  course_code: string;
  teacher_id: string;
  teacher_name?: string;
  livekit_room_name: string;
  is_active: boolean;
  created_at: string;
}

export interface ClassSession {
  id: string;
  classroom_id: string;
  title: string;
  status: SessionStatus;
  scheduled_start_time: string;
  scheduled_end_time: string;
  actual_start_time?: string;
  actual_end_time?: string;
  livekit_room_name?: string;
  created_at: string;
}

export interface JoinSessionResponse {
  token: string;
  server_url: string;
  session_id: string;
  participant_identity: string;
  participant_name: string;
  role: UserRole;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  senderIdentity: string;
  text: string;
  timestamp: number;
}
