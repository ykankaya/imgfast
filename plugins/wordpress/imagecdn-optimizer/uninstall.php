<?php
/**
 * ImageCDN Optimizer Uninstall
 *
 * Fired when the plugin is deleted.
 *
 * @package ImageCDN
 */

// Exit if not called by WordPress
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

/**
 * Clean up plugin data on uninstall
 */
function imagecdn_uninstall() {
    // Delete plugin options
    delete_option('imagecdn_settings');

    // Delete any transients
    delete_transient('imagecdn_stats');
    delete_transient('imagecdn_connection_status');

    // Clean up user meta if any
    delete_metadata('user', 0, 'imagecdn_dismissed_notices', '', true);

    // Remove any scheduled events
    $timestamp = wp_next_scheduled('imagecdn_daily_stats');
    if ($timestamp) {
        wp_unschedule_event($timestamp, 'imagecdn_daily_stats');
    }

    // For multisite, clean up each site
    if (is_multisite()) {
        $sites = get_sites(['fields' => 'ids']);

        foreach ($sites as $site_id) {
            switch_to_blog($site_id);

            delete_option('imagecdn_settings');
            delete_transient('imagecdn_stats');
            delete_transient('imagecdn_connection_status');

            restore_current_blog();
        }
    }
}

imagecdn_uninstall();
