interface Submission {
  submitted: boolean;
  excused: boolean;
  graded: boolean;
  posted_at: string | null;
  late: boolean;
  missing: boolean;
  needs_grading: boolean;
  has_feedback: boolean;
  redo_request: boolean;
}

interface Plannable {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  points_possible: number;
  due_at: string;
}

interface PlannerItem {
  context_type: string;
  course_id: number;
  plannable_id: number;
  planner_override: PlannerOverride | false;
  plannable_type: string;
  new_activity: boolean;
  submissions: Submission;
  plannable_date: string;
  plannable: Plannable;
  html_url: string;
  context_name: string;
  context_image: string | null;
}

interface PlannerOverride {
  id: number;
  plannable_type: string;
  plannable_id: number;
  user_id: number;
  workflow_state: string;
  marked_complete: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  dismissed: boolean;
  assignment_id: number;
}