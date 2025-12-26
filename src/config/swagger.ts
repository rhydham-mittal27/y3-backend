import path from 'path';
import swaggerJSDoc from 'swagger-jsdoc';

const port = process.env.PORT || 5000;
const baseUrl = process.env.API_BASE_URL || `http://localhost:${port}`;

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'YourShikshak Backend API',
      version: '1.0.0',
      description: 'Manager Dashboard Backend API documentation',
    },
    servers: [
      {
        url: baseUrl,
        description: 'Current environment',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    paths: {
      '/api/health': {
        get: {
          summary: 'Health check',
          description: 'Returns server and database health information',
          tags: ['Health'],
          responses: {
            '200': {
              description: 'Server is healthy',
            },
            '503': {
              description: 'Server is running but database is unavailable',
            },
          },
        },
      },
      // Student APIs (mounted at /api/students)
      '/api/students/dashboard/stats': {
        get: {
          summary: 'Get parent dashboard stats',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Dashboard statistics for parent user',
            },
          },
        },
      },
      '/api/students/my-classes': {
        get: {
          summary: 'Get classes for parent student',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'List of classes',
            },
          },
        },
      },
      '/api/students/announcements': {
        get: {
          summary: 'Get announcements for parent student',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'List of announcements',
            },
          },
        },
      },
      '/api/students/student/dashboard/stats': {
        get: {
          summary: 'Get student dashboard stats',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Dashboard statistics for logged-in student',
            },
          },
        },
      },
      '/api/students/student/classes': {
        get: {
          summary: 'Get classes for logged-in student',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'List of classes',
            },
          },
        },
      },
      '/api/students/student/attendance': {
        get: {
          summary: 'Get attendance for logged-in student',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Attendance records',
            },
          },
        },
      },
      '/api/students/student/tests': {
        get: {
          summary: 'Get tests for logged-in student',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Test list and details',
            },
          },
        },
      },
      '/api/students/student/notes': {
        get: {
          summary: 'Get notes for logged-in student',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Notes list',
            },
          },
        },
      },
      '/api/students/student/payments': {
        get: {
          summary: 'Get payments for logged-in student',
          tags: ['Students'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Payment history',
            },
          },
        },
      },

      // Tutor APIs (mounted at /api/tutors)
      '/api/tutors/public/{teacherKey}/reviews': {
        get: {
          summary: 'Get public tutor reviews',
          tags: ['Tutors'],
          parameters: [
            {
              name: 'teacherKey',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Teacher identifier (teacherId or internal id)',
            },
          ],
          responses: {
            '200': {
              description: 'List of reviews for the tutor',
            },
          },
        },
      },
      '/api/tutors': {
        get: {
          summary: 'Get list of tutors',
          tags: ['Tutors'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'List of tutors',
            },
          },
        },
        post: {
          summary: 'Create or update tutor profile',
          tags: ['Tutors'],
          security: [{ bearerAuth: [] }],
          responses: {
            '201': {
              description: 'Tutor profile created',
            },
          },
        },
      },
      '/api/tutors/my-profile': {
        get: {
          summary: 'Get logged-in tutor profile',
          tags: ['Tutors'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Tutor profile',
            },
          },
        },
      },
      '/api/tutors/{id}': {
        get: {
          summary: 'Get tutor by id',
          tags: ['Tutors'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Tutor details',
            },
          },
        },
        put: {
          summary: 'Update tutor profile',
          tags: ['Tutors'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Tutor profile updated',
            },
          },
        },
        delete: {
          summary: 'Delete tutor profile',
          tags: ['Tutors'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '204': {
              description: 'Tutor profile deleted',
            },
          },
        },
      },
      '/api/tutors/{tutorId}/performance': {
        get: {
          summary: 'Get tutor performance metrics',
          tags: ['Tutors'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'tutorId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Performance metrics',
            },
          },
        },
      },
      '/api/tutors/{tutorId}/feedback': {
        get: {
          summary: 'Get tutor feedback',
          tags: ['Tutors'],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'tutorId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Feedback list',
            },
          },
        },
      },
      '/api/tutors/feedback': {
        post: {
          summary: 'Submit tutor feedback',
          tags: ['Tutors'],
          security: [{ bearerAuth: [] }],
          responses: {
            '201': {
              description: 'Feedback submitted',
            },
          },
        },
      },
      '/api/tutors/coordinator/tutors': {
        get: {
          summary: 'Get tutors for coordinator',
          tags: ['Tutors'],
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'List of coordinator tutors',
            },
          },
        },
      },
    },
  },
  apis: [
    path.join(__dirname, '../routes/*.ts'),
    path.join(__dirname, '../controllers/*.ts'),
  ],
};

export const swaggerSpec = swaggerJSDoc(options);
