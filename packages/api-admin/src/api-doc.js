// OpenAPI 3 — api-admin (все операции за HTTP Basic)
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'mvidia admin API',
    version: '1.0.0',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      basicAuth: {
        type: 'http',
        scheme: 'basic',
      },
    },
    schemas: {
      Message: {
        type: 'object',
        properties: { message: { type: 'string' } },
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
      UserDetail: {
        allOf: [
          { $ref: '#/components/schemas/User' },
          {
            type: 'object',
            required: ['videoCount'],
            properties: {
              videoCount: { type: 'integer', minimum: 0 },
            },
          },
        ],
      },
      UserList: {
        type: 'object',
        required: ['total', 'items'],
        properties: {
          total: { type: 'integer' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/User' },
          },
        },
      },
      ConversionLog: {
        type: 'object',
        required: ['id', 'publicId', 'attempt', 'status', 'startedAt'],
        properties: {
          id: { type: 'string' },
          publicId: { type: 'string' },
          jobId: { type: 'string', nullable: true },
          attempt: { type: 'integer', minimum: 1 },
          status: {
            type: 'string',
            enum: ['running', 'completed', 'failed', 'skipped', 'cancelled'],
          },
          sourceSizeBytes: { type: 'integer', nullable: true },
          videoDurationSec: { type: 'number', nullable: true },
          workDurationMs: { type: 'integer', nullable: true },
          strategy: { type: 'string', nullable: true },
          usedCopy: { type: 'boolean', nullable: true },
          deliverySizeBytes: { type: 'integer', nullable: true },
          errorMessage: { type: 'string', nullable: true },
          startedAt: { type: 'string', format: 'date-time' },
          finishedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      ConversionLogList: {
        type: 'object',
        required: ['total', 'items'],
        properties: {
          total: { type: 'integer' },
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/ConversionLog' },
          },
        },
      },
      UserPatch: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          phone: { type: 'string' },
          password: {
            type: 'string',
            description: 'Новый пароль (6 символов); пустая строка — не менять',
          },
        },
      },
    },
  },
  security: [{ basicAuth: [] }],
  paths: {
    '/config': {
      get: {
        operationId: 'getConfig',
        summary: 'Настройки для UI (публичный URL сайта)',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['publicSiteUrl', 'userApiDocsUrl'],
                  properties: {
                    publicSiteUrl: {
                      type: 'string',
                      nullable: true,
                      description: 'USER_PUBLIC_SITE_URL из .env',
                    },
                    userApiDocsUrl: {
                      type: 'string',
                      nullable: true,
                      description: 'OpenAPI api-user: {publicSiteUrl}/api-docs',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/videos': {
      get: {
        operationId: 'listVideos',
        summary: 'Список видео',
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
                schema: {
                  type: 'object',
                  required: ['total', 'items'],
                  properties: {
                    total: { type: 'integer' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: [
                          'publicId',
                          'title',
                          'sizeBytes',
                          'mimeType',
                          'createdAt',
                        ],
                        properties: {
                          publicId: { type: 'string' },
                          title: { type: 'string' },
                          sizeBytes: { type: 'integer' },
                          mimeType: { type: 'string' },
                          createdAt: { type: 'string', format: 'date-time' },
                          status: { type: 'string' },
                          authorName: {
                            type: 'string',
                            description: 'Имя автора (snapshot), пусто для гостевых',
                          },
                          visibility: {
                            type: 'string',
                            enum: ['public', 'private'],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/videos/{publicId}': {
      delete: {
        operationId: 'deleteVideo',
        summary: 'Удалить видео',
        parameters: [
          {
            name: 'publicId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1, maxLength: 64 },
          },
        ],
        responses: {
          '204': { description: 'Удалено' },
          '404': {
            description: 'Не найдено',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { message: { type: 'string' } },
                },
              },
            },
          },
        },
        'x-express-openapi-disable-response-validation-middleware': true,
      },
    },
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: 'Список пользователей',
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
                schema: { $ref: '#/components/schemas/UserList' },
              },
            },
          },
        },
      },
    },
    '/users/{id}': {
      get: {
        operationId: 'getUserById',
        summary: 'Пользователь по id',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1 },
          },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserDetail' },
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
      patch: {
        operationId: 'patchUser',
        summary: 'Изменить пользователя',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1 },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserPatch' },
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
          '404': {
            description: 'Не найдено',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
          '409': {
            description: 'Номер занят',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
        },
      },
      delete: {
        operationId: 'deleteUser',
        summary: 'Удалить пользователя',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1 },
          },
        ],
        responses: {
          '204': { description: 'Удалено' },
          '404': {
            description: 'Не найдено',
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
    '/conversion-logs': {
      get: {
        operationId: 'listConversionLogs',
        summary: 'Журнал конвертации (воркер)',
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
          {
            name: 'publicId',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Фильтр по publicId видео',
          },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConversionLogList' },
              },
            },
          },
        },
      },
    },
    '/transcode-jobs/{jobId}/cancel': {
      post: {
        operationId: 'cancelConversionJob',
        summary: 'Отменить задачу конвертации (BullMQ)',
        parameters: [
          {
            name: 'jobId',
            in: 'path',
            required: true,
            schema: { type: 'string', minLength: 1 },
          },
        ],
        responses: {
          '200': {
            description: 'Отменено',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['cancelled', 'jobId'],
                  properties: {
                    cancelled: { type: 'boolean' },
                    jobId: { type: 'string' },
                    publicId: { type: 'string', nullable: true },
                    jobState: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          '409': {
            description: 'Не удалось отменить',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' },
              },
            },
          },
        },
      },
    },
  },
};
