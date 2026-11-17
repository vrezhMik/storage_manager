<?php

namespace App\Support;

/**
 * Checks a password against a WordPress hash, so people who signed up in
 * Fluent Support keep their password: WordPress 6.8+ "$wp" bcrypt hashes,
 * the older phpass "$P$" hashes, plain bcrypt and very old md5 ones.
 */
class WordPressPassword
{
    private const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    public static function check(string $password, string $hash): bool
    {
        if (str_starts_with($hash, '$wp')) {
            $prehashed = base64_encode(hash_hmac('sha384', $password, 'wp-sha384', true));

            return password_verify($prehashed, substr($hash, 3));
        }
        if (str_starts_with($hash, '$P$') || str_starts_with($hash, '$H$')) {
            return hash_equals($hash, self::phpass($password, $hash));
        }
        if (strlen($hash) === 32 && ctype_xdigit($hash)) {
            return hash_equals($hash, md5($password));
        }

        return password_verify($password, $hash);
    }

    // phpass "portable" hashing as WordPress did it before 6.8.
    public static function phpass(string $password, string $setting): string
    {
        $fail = str_starts_with($setting, '*0') ? '*1' : '*0';
        $countLog2 = strpos(self::ITOA64, $setting[3] ?? '');
        if ($countLog2 === false || $countLog2 < 7 || $countLog2 > 30) {
            return $fail;
        }
        $salt = substr($setting, 4, 8);
        if (strlen($salt) !== 8) {
            return $fail;
        }

        $count = 1 << $countLog2;
        $hash = md5($salt.$password, true);
        do {
            $hash = md5($hash.$password, true);
        } while (--$count);

        return substr($setting, 0, 12).self::encode64($hash, 16);
    }

    private static function encode64(string $input, int $count): string
    {
        $out = '';
        $i = 0;
        do {
            $value = ord($input[$i++]);
            $out .= self::ITOA64[$value & 0x3F];
            if ($i < $count) {
                $value |= ord($input[$i]) << 8;
            }
            $out .= self::ITOA64[($value >> 6) & 0x3F];
            if ($i++ >= $count) {
                break;
            }
            if ($i < $count) {
                $value |= ord($input[$i]) << 16;
            }
            $out .= self::ITOA64[($value >> 12) & 0x3F];
            if ($i++ >= $count) {
                break;
            }
            $out .= self::ITOA64[($value >> 18) & 0x3F];
        } while ($i < $count);

        return $out;
    }
}
