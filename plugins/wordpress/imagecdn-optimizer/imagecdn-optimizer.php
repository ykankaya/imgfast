<?php
/**
 * Plugin Name: ImageCDN Optimizer
 * Plugin URI: https://imagecdn.io/wordpress
 * Description: Optimize and deliver images via ImageCDN's global edge network. Automatic WebP/AVIF conversion, smart compression, and instant delivery.
 * Version: 1.0.0
 * Requires at least: 5.9
 * Requires PHP: 7.4
 * Author: ImageCDN
 * Author URI: https://imagecdn.io
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: imagecdn-optimizer
 * Domain Path: /languages
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Plugin constants
define('IMAGECDN_VERSION', '1.0.0');
define('IMAGECDN_PLUGIN_FILE', __FILE__);
define('IMAGECDN_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('IMAGECDN_PLUGIN_URL', plugin_dir_url(__FILE__));
define('IMAGECDN_PLUGIN_BASENAME', plugin_basename(__FILE__));

/**
 * Autoloader for plugin classes
 */
spl_autoload_register(function ($class) {
    $prefix = 'ImageCDN_';

    if (strpos($class, $prefix) !== 0) {
        return;
    }

    $class_name = str_replace($prefix, '', $class);
    $class_name = strtolower(str_replace('_', '-', $class_name));
    $file = IMAGECDN_PLUGIN_DIR . 'includes/class-imagecdn-' . $class_name . '.php';

    if (file_exists($file)) {
        require_once $file;
    }
});

// Load main plugin class
require_once IMAGECDN_PLUGIN_DIR . 'includes/class-imagecdn.php';

/**
 * Initialize the plugin
 */
function imagecdn_init() {
    return ImageCDN::get_instance();
}

// Start the plugin
add_action('plugins_loaded', 'imagecdn_init');

/**
 * Activation hook
 */
register_activation_hook(__FILE__, function () {
    // Set default options if not exist
    if (!get_option('imagecdn_settings')) {
        add_option('imagecdn_settings', [
            'enabled' => false,
            'public_key' => '',
            'cdn_url' => 'https://cdn.imagecdn.io',
            'default_quality' => 80,
            'default_format' => 'auto',
            'lazy_load' => true,
            'excluded_paths' => [],
            'include_srcset' => true,
            'custom_domain' => '',
            'auto_webp' => true,
        ]);
    }

    // Clear rewrite rules
    flush_rewrite_rules();
});

/**
 * Deactivation hook
 */
register_deactivation_hook(__FILE__, function () {
    flush_rewrite_rules();
});

/**
 * Add settings link on plugins page
 */
add_filter('plugin_action_links_' . IMAGECDN_PLUGIN_BASENAME, function ($links) {
    $settings_link = sprintf(
        '<a href="%s">%s</a>',
        admin_url('options-general.php?page=imagecdn-settings'),
        __('Settings', 'imagecdn-optimizer')
    );
    array_unshift($links, $settings_link);
    return $links;
});
