// OpenAPI 3 — источник правды для express-openapi (api-user)
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'mvidia user API',
    version: '1.0.0',
  },
  servers: [{ url: '/' }],
  paths: {
    '/auth/register': {
      post: {
        operationId: 'register',
        summary: 'Регистрация (телефон РФ +7)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterBody' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Создан пользователь',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '400': {
            description: 'Ошибка валидации',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
          '409': {
            description: 'Номер уже зарегистрирован',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
          '429': {
            description: 'Слишком много попыток',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        operationId: 'login',
        summary: 'Вход',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginBody' },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '400': {
            description: 'Ошибка запроса',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
          '401': {
            description: 'Неверный телефон или пароль',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
          '429': {
            description: 'Слишком много попыток',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        operationId: 'logout',
        summary: 'Выход (no-op, токен удаляется на клиенте)',
        responses: {
          '204': { description: 'OK' },
        },
      },
    },
    '/me': {
      get: {
        operationId: 'getMe',
        summary: 'Текущий пользователь',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          '401': {
            description: 'Требуется авторизация',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
        },
      },
      patch: {
        operationId: 'patchMe',
        summary: 'Изменить имя',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/User' },
              },
            },
          },
          '400': {
            description: 'Ошибка валидации',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
          '401': {
            description: 'Требуется авторизация',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
        },
      },
    },
    '/me/password': {
      patch: {
        operationId: 'patchMePassword',
        summary: 'Сменить пароль',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ChangePasswordBody' },
            },
          },
        },
        responses: {
          '204': { description: 'OK' },
          '400': {
            description: 'Ошибка валидации',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
          '401': {
            description: 'Неверный пароль или не авторизован',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
        },
        'x-express-openapi-disable-response-validation-middleware': true,
      },
    },
    '/me/videos': {
      get: {
        operationId: 'listMyVideos',
        summary: 'Мои загруженные видео',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'offset',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 0, default: 0 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VideoList' },
              },
            },
          },
          '401': {
            description: 'Требуется авторизация',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
        },
      },
    },
    '/videos': {
      post: {
        operationId: 'createVideo',
        summary: 'Загрузить видео (MP4, MOV, MKV, WebM, AVI)',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'title'],
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Видеофайл',
                  },
                  title: {
                    type: 'string',
                    minLength: 1,
                    maxLength: 500,
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Принято в обработку',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VideoCreated' },
              },
            },
          },
          '400': {
            description: 'Ошибка запроса',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
          '503': {
            description: 'Очередь недоступна',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
        },
      },
    },
    '/videos/{publicId}': {
      get: {
        operationId: 'getVideoByPublicId',
        summary: 'Метаданные видео',
        parameters: [
          {
            name: 'publicId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 64 },
          },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VideoMeta' },
              },
            },
          },
          '404': {
            description: 'Не найдено',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
        },
      },
    },
    '/videos/{publicId}/poster': {
      get: {
        operationId: 'streamVideoPoster',
        summary: 'JPEG-постер (только ready)',
        'x-express-openapi-disable-response-validation-middleware': true,
        parameters: [
          {
            name: 'publicId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 64 },
          },
        ],
        responses: {
          '200': { description: 'JPEG' },
          '404': { description: 'Не найдено' },
        },
      },
    },
    '/videos/{publicId}/file': {
      get: {
        operationId: 'streamVideoFile',
        summary: 'Поток MP4 (только ready, Range)',
        'x-express-openapi-disable-response-validation-middleware': true,
        parameters: [
          {
            name: 'publicId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 64 },
          },
        ],
        responses: {
          '200': { description: 'Полный файл' },
          '206': { description: 'Частичное содержимое' },
          '404': { description: 'Не найдено' },
          '416': { description: 'Недопустимый диапазон' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Message: {
        type: 'object',
        properties: { message: { type: 'string' } },
      },
      RegisterBody: {
        type: 'object',
        required: ['phone', 'password', 'name'],
        properties: {
          phone: { type: 'string' },
          password: { type: 'string', minLength: 6, maxLength: 6 },
          name: { type: 'string', minLength: 1, maxLength: 100 },
        },
      },
      LoginBody: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string' },
          password: { type: 'string' },
        },
      },
      ChangePasswordBody: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 6, maxLength: 6 },
        },
      },
      User: {
        type: 'object',
        required: ['id', 'phone', 'name', 'createdAt'],
        properties: {
          id: { type: 'string' },
          phone: { type: 'string' },
          name: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AuthResponse: {
        type: 'object',
        required: ['token', 'user'],
        properties: {
          token: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      VideoList: {
        type: 'object',
        required: ['total', 'items'],
        properties: {
          total: { type: 'integer' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/VideoMeta' },
          },
        },
      },
      VideoCreated: {
        type: 'object',
        required: ['publicId', 'title', 'status'],
        properties: {
          publicId: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['not_ready', 'ready', 'failed'] },
          processingStep: {
            type: 'string',
            enum: ['uploaded', 'queued', 'converting', 'finalizing'],
          },
          sourceSizeBytes: { type: 'integer' },
        },
      },
      VideoMeta: {
        type: 'object',
        required: ['publicId', 'title', 'status', 'createdAt'],
        properties: {
          publicId: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['not_ready', 'ready', 'failed'] },
          processingStep: {
            type: 'string',
            enum: ['uploaded', 'queued', 'converting', 'finalizing'],
          },
          errorMessage: { type: 'string' },
          mimeType: { type: 'string' },
          sizeBytes: { type: 'integer', nullable: true },
          sourceSizeBytes: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          authorName: { type: 'string', description: 'Имя автора (snapshot)' },
        },
      },
    },
  },
};
