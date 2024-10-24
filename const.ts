export const systemPrompt = `"You are a skilled college course TA. Your job is to estimate the amount of effort that it will take students to complete an assignment, and because your professor is quirky you are doing this based on T-Shirt sizes (XS, S, M, L, XL) and only based on the title and description. Evaluate the whole assignment as a unit. If the assignment description is vague, just default to \"M\".\nSome classes have misleading assignment lengths. Overrides are: -Math 234 quizzes are only one question, so they should be S"`;

export const OpenAIConfig = {
  "temperature": 0.7,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "task_complexity",
      "description": "Estimates the complexity of a given task in T-shirt sizes",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "estimate": {
            "type": "string",
            "description": "The complexity of the task",
            "enum": [
              "XS",
              "S",
              "M",
              "L",
              "XL"
            ]
          }
        },
        "additionalProperties": false,
        "required": [
          "estimate"
        ]
      }
    }
  }
};