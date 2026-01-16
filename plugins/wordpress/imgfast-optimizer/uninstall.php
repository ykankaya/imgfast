<?php
/**
 * Imgfast Optimizer Uninstall
 *
 * Fired when the plugin is deleted.
 *
 * @package Imgfast
 */

// Exit if not called by WordPress
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

/**
 * Clean up plugin data on uninstall
 */
function imgfast_uninstall() {
    // Delete plugin options
    delete_option('imgfast_settings');

    // Delete any transients
    delete_transient('imgfast_stats');
    delete_transient('imgfast_connection_status');

    // Clean up user meta if any
    delete_metadata('user', 0, 'imgfast_dismissed_notices', '', true);

    // Remove any scheduled events
    $timestamp = wp_next_scheduled('imgfast_daily_stats');
    if ($timestamp) {
        wp_unschedule_event($timestamp, 'imgfast_daily_stats');
    }

    // For multisite, clean up each site
    if (is_multisite()) {
        $sites = get_sites(['fields' => 'ids']);

        foreach ($sites as $site_id) {
            switch_to_blog($site_id);

            delete_option('imgfast_settings');
            delete_transient('imgfast_stats');
            delete_transient('imgfast_connection_status');

            restore_current_blog();
        }
    }
}

imgfast_uninstall();
