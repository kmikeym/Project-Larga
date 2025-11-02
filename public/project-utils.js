// Project Management Utilities
// Shared across all pages for consistent project handling

const ProjectUtils = {
  // Get current project ID from localStorage
  getCurrentProjectId() {
    return localStorage.getItem('currentProjectId') || 'default';
  },

  // Set current project ID
  setCurrentProjectId(projectId) {
    localStorage.setItem('currentProjectId', projectId);
  },

  // Get headers with project ID for API requests
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Project-Id': this.getCurrentProjectId()
    };
  },

  // Fetch wrapper that includes project headers
  async fetchWithProject(url, options = {}) {
    const headers = {
      ...this.getHeaders(),
      ...(options.headers || {})
    };

    return fetch(url, {
      ...options,
      headers
    });
  },

  // Load current project info
  async getCurrentProject() {
    try {
      const response = await this.fetchWithProject(`${window.location.origin}/api/projects`);
      const data = await response.json();

      if (data.success && data.projects.length > 0) {
        const currentId = this.getCurrentProjectId();
        const project = data.projects.find(p => p.id === currentId) || data.projects[0];

        // If current project doesn't exist, switch to first available
        if (!data.projects.find(p => p.id === currentId)) {
          this.setCurrentProjectId(project.id);
        }

        return project;
      }

      return null;
    } catch (error) {
      console.error('Error loading current project:', error);
      return null;
    }
  },

  // Render project switcher UI
  async renderProjectSwitcher(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    try {
      const response = await fetch(`${window.location.origin}/api/projects`);
      const data = await response.json();

      if (!data.success) {
        container.innerHTML = '<span style="color: #c33;">Error loading projects</span>';
        return;
      }

      const projects = data.projects;
      const currentId = this.getCurrentProjectId();

      if (projects.length === 0) {
        container.innerHTML = `
          <a href="/projects.html" style="color: #111; text-decoration: none;">
            📁 Create Project
          </a>
        `;
        return;
      }

      const currentProject = projects.find(p => p.id === currentId) || projects[0];

      container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
          <span style="color: #666; font-size: 0.85em;">Project:</span>
          <select id="projectSelector" style="
            padding: 6px 12px;
            border: 1px solid #e0e0e0;
            background: white;
            font-family: inherit;
            font-size: 0.9em;
            cursor: pointer;
          ">
            ${projects.map(p => `
              <option value="${p.id}" ${p.id === currentId ? 'selected' : ''}>
                ${this.escapeHtml(p.name)} (${p.documentCount} docs)
              </option>
            `).join('')}
          </select>
          <a href="/projects.html" style="
            color: #666;
            text-decoration: none;
            font-size: 0.85em;
            padding: 6px 12px;
            border: 1px solid #e0e0e0;
            background: white;
            transition: all 0.2s;
          " onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='white'">
            Manage Projects
          </a>
        </div>
      `;

      // Add change handler
      const selector = document.getElementById('projectSelector');
      selector.addEventListener('change', (e) => {
        this.setCurrentProjectId(e.target.value);
        window.location.reload();
      });

    } catch (error) {
      container.innerHTML = '<span style="color: #c33;">Error loading projects</span>';
      console.error('Error rendering project switcher:', error);
    }
  },

  // Check if user needs to select a project (show modal if no project)
  async checkProjectSelection() {
    try {
      const response = await fetch(`${window.location.origin}/api/projects`);
      const data = await response.json();

      if (!data.success) return;

      const projects = data.projects;

      // If no projects exist, redirect to projects page
      if (projects.length === 0 && window.location.pathname !== '/projects.html') {
        window.location.href = '/projects.html';
        return;
      }

      // If current project doesn't exist, switch to first available
      const currentId = this.getCurrentProjectId();
      if (!projects.find(p => p.id === currentId) && projects.length > 0) {
        this.setCurrentProjectId(projects[0].id);
      }
    } catch (error) {
      console.error('Error checking project selection:', error);
    }
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Auto-check project selection on page load (except projects.html)
if (window.location.pathname !== '/projects.html') {
  ProjectUtils.checkProjectSelection();
}
