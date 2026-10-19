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
  classroom_title?: string;
  course_code?: string;
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

export interface FaceCaptureResponse {
  passed: boolean;
  num_faces: number;
  message: string;
  embedding?: number[] | null;
  quality_details?: {
    face_width?: number;
    face_height?: number;
    blur_score?: number;
    brightness?: number;
  } | null;
}

export interface EnrollmentCompleteResponse {
  success: boolean;
  message: string;
  enrolled_at?: string;
  consistency_score?: number;
}

export interface EnrollmentStatusResponse {
  is_enrolled: boolean;
  enrolled_at?: string | null;
  student_id: string;
  student_name: string;
  student_id_number: string;
  embedding_dim: number;
}

export interface FaceVerificationResponse {
  verified: boolean;
  identity?: string | null;
  similarity: number;
  message: string;
  quality_details?: {
    face_width?: number;
    face_height?: number;
    blur_score?: number;
    brightness?: number;
  } | null;
}

export interface AttendanceVerificationResponse {
  verified: boolean;
  reason: string;
  attendance_status: 'PRESENT' | 'LATE' | 'UNVERIFIED' | 'ABSENT';
  message: string;
  samples_confirmed: number;
  samples_required: number;
  first_verified_at?: string | null;
  last_verified_at?: string | null;
}

export interface AttendanceRecordResponse {
  id: string;
  session_id: string;
  student_id: string;
  student_name: string;
  student_id_number: string;
  status: 'PRESENT' | 'LATE' | 'UNVERIFIED' | 'ABSENT';
  marked_at: string;
  first_verified_at?: string | null;
  last_verified_at?: string | null;
  verification_count: number;
  presence_duration_seconds: number;
  is_manually_corrected: boolean;
  corrected_by_name?: string | null;
  correction_reason?: string | null;
}

export interface SessionAttendanceSummaryResponse {
  session_id: string;
  session_title: string;
  classroom_title: string;
  total_students: number;
  present_count: number;
  late_count: number;
  unverified_count: number;
  absent_count: number;
  records: AttendanceRecordResponse[];
}

export interface StudentAttendanceSummaryResponse {
  total_sessions: number;
  present_count: number;
  late_count: number;
  unverified_count: number;
  absent_count: number;
  attendance_percentage: number;
}

export interface TeacherAttendanceSummaryResponse {
  total_classrooms: number;
  total_sessions_conducted: number;
  overall_attendance_rate: number;
}

export interface FacialAnalysisResult {
  valid_input: boolean;
  face_detected: boolean;
  attentiveness_score: number;
  head_pose: {
    pitch: number;
    yaw: number;
    roll: number;
    orientation: string;
  };
  dominant_emotion: string;
  emotion_probabilities: Record<string, number>;
  emotion_model_loaded: boolean;
  is_distracted: boolean;
  distraction_type?: string | null;
  confidence: number;
}

export interface SentimentAnalysisResult {
  valid_input: boolean;
  text: string;
  sentiment_score?: number | null;
  sentiment_label: string;
  is_question: boolean;
  is_confusion: boolean;
  confidence?: number | null;
  language?: string | null;
  language_supported?: boolean;
  status?: string | null;
  note?: string | null;
}

export interface RecentTranscriptSnippet {
  id: string;
  timestamp: string;
  transcript_text: string;
  language?: string | null;
  sentiment_label?: string | null;
  sentiment_score?: number | null;
}

export interface StudentSpeechSentimentSummary {
  student_id: string;
  total_segments: number;
  valid_analyzed_segments: number;
  unsupported_language_segments: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  confused_count: number;
  positive_percentage: number;
  negative_percentage: number;
  neutral_percentage: number;
  confused_percentage: number;
  dominant_sentiment?: string | null;
  dominant_status: 'no_transcripts' | 'insufficient_data' | 'unsupported_language' | 'analyzed';
  dominant_language?: string | null;
  recent_snippets: RecentTranscriptSnippet[];
}

export interface ClassroomSpeechSentimentSummary {
  session_id: string;
  total_student_transcripts: number;
  valid_analyzed_transcripts: number;
  unsupported_language_transcripts: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  confused_count: number;
  positive_percentage: number;
  negative_percentage: number;
  neutral_percentage: number;
  confused_percentage: number;
  dominant_sentiment?: string | null;
  status: 'no_transcripts' | 'insufficient_data' | 'unsupported_language' | 'active';
}

export interface StudentFacialSummary {
  student_id: string;
  dominant_expression: string;
  expression_distribution: Record<string, number>;
  total_samples: number;
  valid_samples: number;
  valid_windows: number;
  attentiveness_score?: number | null;
  head_pose_orientation?: string | null;
  status: 'analyzed' | 'insufficient_data';
}

export interface StudentEngagementSummary {
  student_id: string;
  session_id: string;
  student_name?: string | null;
  student_email?: string | null;
  student_id_number?: string | null;
  composite_score?: number | null;
  attentiveness_subscore?: number | null;
  participation_subscore?: number | null;
  sentiment_subscore?: number | null;
  sample_count: number;
  distraction_count: number;
  question_count: number;
  speech_sentiment?: StudentSpeechSentimentSummary | null;
  facial_summary?: StudentFacialSummary | null;
}

export interface SessionAnalyticsOverview {
  session_id: string;
  average_engagement: number;
  attendance_rate: number;
  total_distractions: number;
  total_questions: number;
  student_summaries: StudentEngagementSummary[];
  classroom_speech_sentiment?: ClassroomSpeechSentimentSummary | null;
}

export interface FacialWindowAnalytics {
  window_start: string;
  window_end: string;
  dominant_expression: string;
  expression_distribution: Record<string, number>;
  students_analyzed: number;
  students_with_valid_expression: number;
  students_with_insufficient_data: number;
}

export interface StudentFacialWindowAnalytics {
  window_start: string;
  window_end: string;
  student_id: string;
  dominant_expression: string;
  confidence: number;
  sample_count: number;
  valid_sample_count: number;
  expression_probabilities: Record<string, number>;
}

export interface SessionFacialSummary {
  session_id: string;
  dominant_expression: string;
  expression_distribution: Record<string, number>;
  total_windows: number;
  valid_windows: number;
}
export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResponse {
  text: string;
  language: string;
  language_probability: number;
  duration: number;
  segments: TranscriptSegment[];
  sentiment_label?: string | null;
  sentiment_score?: number | null;
  is_question?: boolean | null;
  is_confusion?: boolean | null;
  analysis_id?: string | null;
  quality_status?: string | null;
  is_low_confidence?: boolean;
  error?: string | null;
}

export interface LanguageOption {
  code: string;
  name: string;
}

export interface SessionTranscriptItem {
  id: string;
  speaker_name: string;
  speaker_role: string;
  text: string;
  language?: string | null;
  sentiment_label?: string | null;
  sentiment_score?: number | null;
  created_at: string;
}

export interface LiveTranscriptMessage {
  id: string;
  speakerName: string;
  speakerIdentity: string;
  speakerRole: string;
  text: string;
  language?: string | null;
  sentimentLabel?: string | null;
  timestamp: number;
  quality_status?: string | null;
  is_low_confidence?: boolean;
}


