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
  },
};
