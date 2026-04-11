# Contributing to EduZyniq

Thank you for your interest in contributing to EduZyniq! 🎉

## Getting Started

1. **Fork the repository**
2. **Clone your fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/EduZyniq.git
   cd EduZyniq
   ```

3. **Set up development environment**
   - Follow the Quick Start guide in README.md
   - Create `.env` file from `.env.example`
   - Install dependencies for both frontend and backend

## Development Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, readable code
   - Follow existing code style
   - Add comments for complex logic

3. **Test your changes**
   - Test frontend: `npm run dev`
   - Test backend: `uvicorn main:app --reload`

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create Pull Request**
   - Go to the original repository
   - Click "New Pull Request"
   - Describe your changes

## Commit Message Convention

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting)
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

## Code Style

### Frontend (TypeScript/React)
- Use functional components with hooks
- Use TypeScript for type safety
- Follow existing component structure
- Use inline styles for component-specific styling

### Backend (Python)
- Follow PEP 8 style guide
- Use type hints
- Write docstrings for functions
- Keep functions focused and small

## Need Help?

- Open an issue for bugs or feature requests
- Join discussions in GitHub Discussions
- Contact: support@eduzyniq.ai

Thank you for contributing! 🚀
