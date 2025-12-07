FROM composer:2 AS vendor
WORKDIR /app

# Copy full application for Composer scripts (package discovery, etc.)
COPY . .
RUN composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader

FROM php:8.3-fpm-alpine

RUN apk add --no-cache icu-dev libzip-dev libpng-dev oniguruma-dev \
    && docker-php-ext-install pdo_mysql intl zip gd opcache \
    && apk del icu-dev libzip-dev libpng-dev oniguruma-dev

WORKDIR /var/www/html

COPY --from=vendor /app/vendor ./vendor
COPY --from=vendor /app .

RUN mkdir -p storage/framework/{cache,views,sessions} bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

USER www-data

CMD ["php-fpm"]
