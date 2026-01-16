<?php
/**
 * Imgfast Settings Manager
 *
 * @package Imgfast
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Manages plugin settings with validation
 */
class Imgfast_Settings {

    /**
     * Option key in wp_options table
     */
    const OPTION_KEY = 'imgfast_settings';

    /**
     * Default settings
     *
     * @var array
     */
    private $defaults = [
        'enabled'          => false,
        'public_key'       => '',
        'cdn_url'          => 'https://cdn.imgfast.io',
        'default_quality'  => 80,
        'default_format'   => 'auto',
        'lazy_load'        => true,
        'excluded_paths'   => [],
        'include_srcset'   => true,
        'custom_domain'    => '',
        'auto_webp'        => true,
    ];

    /**
     * Cached settings
     *
     * @var array|null
     */
    private $settings_cache = null;

    /**
     * Get a setting value
     *
     * @param string $key Setting key
     * @param mixed $default Default value if not set
     * @return mixed
     */
    public function get($key, $default = null) {
        $settings = $this->get_all();

        if (isset($settings[$key])) {
            return $settings[$key];
        }

        if ($default !== null) {
            return $default;
        }

        return $this->defaults[$key] ?? null;
    }

    /**
     * Get all settings
     *
     * @return array
     */
    public function get_all() {
        if ($this->settings_cache === null) {
            $this->settings_cache = wp_parse_args(
                get_option(self::OPTION_KEY, []),
                $this->defaults
            );
        }
        return $this->settings_cache;
    }

    /**
     * Set a setting value
     *
     * @param string $key Setting key
     * @param mixed $value Setting value
     * @return bool
     */
    public function set($key, $value) {
        $settings = $this->get_all();
        $settings[$key] = $this->sanitize($key, $value);

        $result = update_option(self::OPTION_KEY, $settings);

        // Clear cache
        $this->settings_cache = null;

        return $result;
    }

    /**
     * Set multiple settings at once
     *
     * @param array $values Key-value pairs
     * @return bool
     */
    public function set_multiple($values) {
        $settings = $this->get_all();

        foreach ($values as $key => $value) {
            if (array_key_exists($key, $this->defaults)) {
                $settings[$key] = $this->sanitize($key, $value);
            }
        }

        $result = update_option(self::OPTION_KEY, $settings);

        // Clear cache
        $this->settings_cache = null;

        return $result;
    }

    /**
     * Check if the plugin is enabled and configured
     *
     * @return bool
     */
    public function is_enabled() {
        return $this->get('enabled') && !empty($this->get('public_key'));
    }

    /**
     * Get the CDN base URL
     *
     * @return string
     */
    public function get_cdn_base_url() {
        $custom = $this->get('custom_domain');

        if (!empty($custom)) {
            return 'https://' . preg_replace('#^https?://#', '', $custom);
        }

        $cdn_url = rtrim($this->get('cdn_url'), '/');
        $public_key = $this->get('public_key');

        return $cdn_url . '/' . $public_key;
    }

    /**
     * Validate public key format
     *
     * @param string $key Public key to validate
     * @return bool
     */
    public function validate_public_key($key) {
        return preg_match('/^imgfast_pk_[a-zA-Z0-9]{8,16}$/', $key);
    }

    /**
     * Sanitize a setting value
     *
     * @param string $key Setting key
     * @param mixed $value Raw value
     * @return mixed Sanitized value
     */
    private function sanitize($key, $value) {
        switch ($key) {
            case 'public_key':
                return sanitize_text_field(trim($value));

            case 'cdn_url':
            case 'custom_domain':
                $value = sanitize_text_field(trim($value));
                // Remove trailing slashes
                return rtrim($value, '/');

            case 'default_quality':
                return max(1, min(100, intval($value)));

            case 'default_format':
                $allowed = ['auto', 'webp', 'avif', 'jpeg', 'png'];
                return in_array($value, $allowed) ? $value : 'auto';

            case 'excluded_paths':
                if (is_string($value)) {
                    $value = array_filter(array_map('trim', explode("\n", $value)));
                }
                return array_map('sanitize_text_field', (array) $value);

            case 'enabled':
            case 'lazy_load':
            case 'include_srcset':
            case 'auto_webp':
                return (bool) $value;

            default:
                return sanitize_text_field($value);
        }
    }

    /**
     * Get default value for a setting
     *
     * @param string $key Setting key
     * @return mixed
     */
    public function get_default($key) {
        return $this->defaults[$key] ?? null;
    }

    /**
     * Reset all settings to defaults
     *
     * @return bool
     */
    public function reset() {
        $result = update_option(self::OPTION_KEY, $this->defaults);
        $this->settings_cache = null;
        return $result;
    }
}
