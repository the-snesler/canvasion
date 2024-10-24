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

interface Properties {
  ID: {
    rich_text: string; //TODO: type better
  };
  "Blocked Date": {
    date: { start: string; end: string | null; time_zone: string | null };
  };
  Class: {
    id: string;
    type: "rich_text";
    rich_text: string; //TODO: type better
  };
  Priority: {
    status: string; //TODO: type better
  };
  Link: {
    url: string;
  };
  Name: {
    id: string;
    type: "title";
    title: string; //TODO: type better
  };
  Due: {
    id: string;
    type: "date";
    date: { start: string; end: string | null; time_zone: string | null };
  };
  Status: {
    id: string;
    type: "status";
    status: string; //TODO: type better
  };
  Estimate: {
    id: string;
    type: "select";
    select: string; //TODO: type better
  };
}

interface Page {
  object: "page";
  id: string;
  created_time: string;
  last_edited_time: string;
  in_trash: boolean;
  properties: Properties;
  url: string;
  public_url: string | null;
}