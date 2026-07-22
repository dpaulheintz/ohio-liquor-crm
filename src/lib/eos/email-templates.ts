export function todoAssignedEmail(params: {
  assigneeName: string;
  todoTitle: string;
  dueDate: string;
  assignedBy: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 520px;
                margin: 0 auto;">
      <div style="background: #16A34A; padding: 24px;
                  border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0; font-size: 18px;">
          High Bank EOS — New To-Do Assigned
        </h2>
      </div>
      <div style="background: white; border: 1px solid #E5E7EB;
                  border-top: none; padding: 24px;
                  border-radius: 0 0 8px 8px;">
        <p style="color: #374151; font-size: 15px;">
          Hi ${params.assigneeName},
        </p>
        <p style="color: #374151; font-size: 15px;">
          You've been assigned a new to-do in the
          High Bank EOS system.
        </p>
        <div style="background: #F9FAFB; border: 1px solid #E5E7EB;
                    border-radius: 6px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px; color: #111827;
                    font-weight: 600; font-size: 16px;">
            ${params.todoTitle}
          </p>
          <p style="margin: 0; color: #6B7280; font-size: 14px;">
            Due: ${params.dueDate}
          </p>
        </div>
        <p style="color: #6B7280; font-size: 13px;">
          Assigned by ${params.assignedBy}
        </p>
        <a href="https://ohio-liquor-crm-opal.vercel.app/eos/todos"
           style="display: inline-block; background: #16A34A;
                  color: white; padding: 10px 20px;
                  border-radius: 6px; text-decoration: none;
                  font-weight: 600; margin-top: 8px;
                  font-size: 14px;">
          View To-Dos →
        </a>
      </div>
    </div>
  `;
}
