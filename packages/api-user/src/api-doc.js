// OpenAPI 3 — источник правды для express-openapi (api-user)
module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'mvidia user API',
    version: '1.0.0',
  },
  servers: [{ url: '/' }],
  paths: {
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
    schemas: {
      Message: {
        type: 'object',
        properties: { message: { type: 'string' } },
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
        },
      },
    },
  },
};
