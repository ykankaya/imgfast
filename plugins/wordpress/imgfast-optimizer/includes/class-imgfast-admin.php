<?php
/**
 * Imgfast Admin Interface
 *
 * @package Imgfast
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Admin settings page and functionality
 */
class Imgfast_Admin {

    /**
     * Settings instance
     *
     * @var Imgfast_Settings
     */
    private $settings;

    /**
     * Constructor
     *
     * @param Imgfast_Settings $settings Settings instance
     */
    public function __construct(Imgfast_Settings $settings) {
        $this->settings = $settings;

        add_action('admin_menu', [$this, 'add_menu_page']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);

        // AJAX handlers
        add_action('wp_ajax_imgfast_test_connection', [$this, 'ajax_test_connection']);
        add_action('wp_ajax_imgfast_clear_cache', [$this, 'ajax_clear_cache']);
        add_action('wp_ajax_imgfast_get_stats', [$this, 'ajax_get_stats']);
    }

    /**
     * Add settings page to menu
     */
    public function add_menu_page() {
        add_options_page(
            __('Imgfast Settings', 'imgfast-optimizer'),
            __('Imgfast', 'imgfast-optimizer'),
            'manage_options',
            'imgfast-settings',
            [$this, 'render_settings_page']
        );
    }

    /**
     * Register settings
     */
    public function register_settings() {
        register_setting(
            'imgfast_settings',
            Imgfast_Settings::OPTION_KEY,
            [
                'type' => 'array',
                'sanitize_callback' => [$this, 'sanitize_settings'],
            ]
        );
    }

    /**
     * Sanitize settings before save
     *
     * @param array $input Raw input
     * @return array Sanitized values
     */
    public function sanitize_settings($input) {
        $sanitized = [];

        $sanitized['enabled'] = !empty($input['enabled']);
        $sanitized['public_key'] = sanitize_text_field($input['public_key'] ?? '');
        $sanitized['cdn_url'] = esc_url_raw($input['cdn_url'] ?? 'https://cdn.imgfast.io');
        $sanitized['default_quality'] = max(1, min(100, intval($input['default_quality'] ?? 80)));
        $sanitized['default_format'] = sanitize_text_field($input['default_format'] ?? 'auto');
        $sanitized['lazy_load'] = !empty($input['lazy_load']);
        $sanitized['include_srcset'] = !empty($input['include_srcset']);
        $sanitized['auto_webp'] = !empty($input['auto_webp']);
        $sanitized['custom_domain'] = sanitize_text_field($input['custom_domain'] ?? '');

        // Process excluded paths
        $excluded = $input['excluded_paths'] ?? '';
        if (is_string($excluded)) {
            $excluded = array_filter(array_map('trim', explode("\n", $excluded)));
        }
        $sanitized['excluded_paths'] = array_map('sanitize_text_field', (array) $excluded);

        return $sanitized;
    }

    /**
     * Enqueue admin assets
     *
     * @param string $hook Current admin page
     */
    public function enqueue_assets($hook) {
        if ($hook !== 'settings_page_imgfast-settings') {
            return;
        }

        wp_enqueue_style(
            'imgfast-admin',
            IMGFAST_PLUGIN_URL . 'admin/css/admin.css',
            [],
            IMGFAST_VERSION
        );

        wp_enqueue_script(
            'imgfast-admin',
            IMGFAST_PLUGIN_URL . 'admin/js/admin.js',
            ['jquery'],
            IMGFAST_VERSION,
            true
        );

        wp_localize_script('imgfast-admin', 'imgfastAdmin', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('imgfast_admin'),
            'strings' => [
                'testing' => __('Testing connection...', 'imgfast-optimizer'),
                'success' => __('Connection successful!', 'imgfast-optimizer'),
                'error' => __('Connection failed:', 'imgfast-optimizer'),
                'clearing' => __('Clearing cache...', 'imgfast-optimizer'),
                'cleared' => __('Cache cleared!', 'imgfast-optimizer'),
            ],
        ]);
    }

    /**
     * Render settings page
     */
    public function render_settings_page() {
        if (!current_user_can('manage_options')) {
            return;
        }

        $active_tab = isset($_GET['tab']) ? sanitize_text_field($_GET['tab']) : 'general';
        ?>
        <div class="wrap imgfast-settings">
            <h1>
                <span class="dashicons dashicons-format-image"></span>
                <?php echo esc_html(get_admin_page_title()); ?>
            </h1>

            <?php if (!$this->settings->is_enabled()): ?>
            <div class="notice notice-warning">
                <p>
                    <?php _e('Imgfast is not active. Enter your API key and enable the plugin to start optimizing images.', 'imgfast-optimizer'); ?>
                    <a href="https://imgfast.io/signup" target="_blank"><?php _e('Get your free API key', 'imgfast-optimizer'); ?></a>
                </p>
            </div>
            <?php endif; ?>

            <nav class="nav-tab-wrapper">
                <a href="?page=imgfast-settings&tab=general"
                   class="nav-tab <?php echo $active_tab === 'general' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('General', 'imgfast-optimizer'); ?>
                </a>
                <a href="?page=imgfast-settings&tab=advanced"
                   class="nav-tab <?php echo $active_tab === 'advanced' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('Advanced', 'imgfast-optimizer'); ?>
                </a>
                <a href="?page=imgfast-settings&tab=status"
                   class="nav-tab <?php echo $active_tab === 'status' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('Status', 'imgfast-optimizer'); ?>
                </a>
            </nav>

            <form method="post" action="options.php">
                <?php
                settings_fields('imgfast_settings');

                switch ($active_tab) {
                    case 'advanced':
                        $this->render_advanced_tab();
                        break;
                    case 'status':
                        $this->render_status_tab();
                        break;
                    default:
                        $this->render_general_tab();
                }

                if ($active_tab !== 'status') {
                    submit_button();
                }
                ?>
            </form>
        </div>
        <?php
    }

    /**
     * Render general settings tab
     */
    private function render_general_tab() {
        $settings = $this->settings->get_all();
        ?>
        <table class="form-table" role="presentation">
            <tr>
                <th scope="row">
                    <label for="imgfast_enabled"><?php _e('Enable Imgfast', 'imgfast-optimizer'); ?></label>
                </th>
                <td>
                    <label>
                        <input type="checkbox"
                               name="<?php echo Imgfast_Settings::OPTION_KEY; ?>[enabled]"
                               id="imgfast_enabled"
                               value="1"
                               <?php checked($settings['enabled']); ?>>
                        <?php _e('Enable image optimization via Imgfast', 'imgfast-optimizer'); ?>
                    </label>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imgfast_public_key"><?php _e('API Key (Public)', 'imgfast-optimizer'); ?></label>
                </th>
                <td>
                    <input type="text"
                           name="<?php echo Imgfast_Settings::OPTION_KEY; ?>[public_key]"
                           id="imgfast_public_key"
                           value="<?php echo esc_attr($settings['public_key']); ?>"
                           class="regular-text"
                           placeholder="imgfast_pk_xxxxxxxxxx">
                    <p class="description">
                        <?php _e('Enter your Imgfast public key.', 'imgfast-optimizer'); ?>
                        <a href="https://dashboard.imgfast.io/api-keys" target="_blank"><?php _e('Get your API key', 'imgfast-optimizer'); ?></a>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imgfast_quality"><?php _e('Default Quality', 'imgfast-optimizer'); ?></label>
                </th>
                <td>
                    <input type="number"
                           name="<?php echo Imgfast_Settings::OPTION_KEY; ?>[default_quality]"
                           id="imgfast_quality"
                           value="<?php echo esc_attr($settings['default_quality']); ?>"
                           min="1"
                           max="100"
                           class="small-text">
                    <p class="description">
                        <?php _e('Image quality (1-100). Lower values = smaller files. Recommended: 80', 'imgfast-optimizer'); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imgfast_auto_webp"><?php _e('Auto WebP/AVIF', 'imgfast-optimizer'); ?></label>
                </th>
                <td>
                    <label>
                        <input type="checkbox"
                               name="<?php echo Imgfast_Settings::OPTION_KEY; ?>[auto_webp]"
                               id="imgfast_auto_webp"
                               value="1"
                               <?php checked($settings['auto_webp']); ?>>
                        <?php _e('Automatically serve WebP/AVIF based on browser support', 'imgfast-optimizer'); ?>
                    </label>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imgfast_lazy_load"><?php _e('Lazy Loading', 'imgfast-optimizer'); ?></label>
                </th>
                <td>
                    <label>
                        <input type="checkbox"
                               name="<?php echo Imgfast_Settings::OPTION_KEY; ?>[lazy_load]"
                               id="imgfast_lazy_load"
                               value="1"
                               <?php checked($settings['lazy_load']); ?>>
                        <?php _e('Add native lazy loading to images', 'imgfast-optimizer'); ?>
                    </label>
                </td>
            </tr>

            <tr>
                <th scope="row"><?php _e('Test Connection', 'imgfast-optimizer'); ?></th>
                <td>
                    <button type="button" class="button" id="imgfast-test-connection">
                        <?php _e('Test CDN Connection', 'imgfast-optimizer'); ?>
                    </button>
                    <span id="imgfast-test-result"></span>
                </td>
            </tr>
        </table>
        <?php
    }

    /**
     * Render advanced settings tab
     */
    private function render_advanced_tab() {
        $settings = $this->settings->get_all();
        ?>
        <table class="form-table" role="presentation">
            <tr>
                <th scope="row">
                    <label for="imgfast_cdn_url"><?php _e('CDN URL', 'imgfast-optimizer'); ?></label>
                </th>
                <td>
                    <input type="url"
                           name="<?php echo Imgfast_Settings::OPTION_KEY; ?>[cdn_url]"
                           id="imgfast_cdn_url"
                           value="<?php echo esc_attr($settings['cdn_url']); ?>"
                           class="regular-text">
                    <p class="description">
                        <?php _e('Default: https://cdn.imgfast.io', 'imgfast-optimizer'); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imgfast_custom_domain"><?php _e('Custom Domain', 'imgfast-optimizer'); ?></label>
                </th>
                <td>
                    <input type="text"
                           name="<?php echo Imgfast_Settings::OPTION_KEY; ?>[custom_domain]"
                           id="imgfast_custom_domain"
                           value="<?php echo esc_attr($settings['custom_domain']); ?>"
                           class="regular-text"
                           placeholder="images.yourdomain.com">
                    <p class="description">
                        <?php _e('Use a custom domain for CDN URLs (requires Pro plan)', 'imgfast-optimizer'); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imgfast_srcset"><?php _e('Responsive Images', 'imgfast-optimizer'); ?></label>
                </th>
                <td>
                    <label>
                        <input type="checkbox"
                               name="<?php echo Imgfast_Settings::OPTION_KEY; ?>[include_srcset]"
                               id="imgfast_srcset"
                               value="1"
                               <?php checked($settings['include_srcset']); ?>>
                        <?php _e('Rewrite srcset attributes for responsive images', 'imgfast-optimizer'); ?>
                    </label>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imgfast_excluded"><?php _e('Excluded Paths', 'imgfast-optimizer'); ?></label>
                </th>
                <td>
                    <textarea name="<?php echo Imgfast_Settings::OPTION_KEY; ?>[excluded_paths]"
                              id="imgfast_excluded"
                              rows="5"
                              class="large-text code"><?php echo esc_textarea(implode("\n", $settings['excluded_paths'])); ?></textarea>
                    <p class="description">
                        <?php _e('Enter paths to exclude (one per line). Images containing these paths will not be optimized.', 'imgfast-optimizer'); ?>
                    </p>
                </td>
            </tr>
        </table>
        <?php
    }

    /**
     * Render status tab
     */
    private function render_status_tab() {
        $settings = $this->settings->get_all();
        ?>
        <div class="imgfast-status-cards">
            <div class="imgfast-status-card">
                <h3><?php _e('Connection Status', 'imgfast-optimizer'); ?></h3>
                <p class="status-indicator <?php echo $this->settings->is_enabled() ? 'status-active' : 'status-inactive'; ?>">
                    <?php echo $this->settings->is_enabled()
                        ? __('Active', 'imgfast-optimizer')
                        : __('Inactive', 'imgfast-optimizer'); ?>
                </p>
            </div>

            <div class="imgfast-status-card">
                <h3><?php _e('CDN URL', 'imgfast-optimizer'); ?></h3>
                <code><?php echo esc_html($this->settings->get_cdn_base_url()); ?></code>
            </div>

            <div class="imgfast-status-card">
                <h3><?php _e('Configuration', 'imgfast-optimizer'); ?></h3>
                <ul>
                    <li><?php printf(__('Quality: %d%%', 'imgfast-optimizer'), $settings['default_quality']); ?></li>
                    <li><?php printf(__('Auto WebP: %s', 'imgfast-optimizer'), $settings['auto_webp'] ? __('Yes', 'imgfast-optimizer') : __('No', 'imgfast-optimizer')); ?></li>
                    <li><?php printf(__('Lazy Load: %s', 'imgfast-optimizer'), $settings['lazy_load'] ? __('Yes', 'imgfast-optimizer') : __('No', 'imgfast-optimizer')); ?></li>
                    <li><?php printf(__('Srcset: %s', 'imgfast-optimizer'), $settings['include_srcset'] ? __('Yes', 'imgfast-optimizer') : __('No', 'imgfast-optimizer')); ?></li>
                </ul>
            </div>
        </div>

        <h3><?php _e('Sample Transformed URL', 'imgfast-optimizer'); ?></h3>
        <?php
        $sample_image = $this->get_sample_image();
        if ($sample_image):
            $rewriter = new Imgfast_Rewriter($this->settings);
            $cdn_url = $rewriter->build_cdn_url($sample_image, ['width' => 800]);
        ?>
        <table class="widefat">
            <tr>
                <th><?php _e('Original URL', 'imgfast-optimizer'); ?></th>
                <td><code><?php echo esc_html($sample_image); ?></code></td>
            </tr>
            <tr>
                <th><?php _e('CDN URL', 'imgfast-optimizer'); ?></th>
                <td><code><?php echo esc_html($cdn_url); ?></code></td>
            </tr>
        </table>
        <?php else: ?>
        <p><?php _e('No images found in media library.', 'imgfast-optimizer'); ?></p>
        <?php endif; ?>

        <h3><?php _e('System Information', 'imgfast-optimizer'); ?></h3>
        <table class="widefat">
            <tr>
                <th><?php _e('WordPress Version', 'imgfast-optimizer'); ?></th>
                <td><?php echo esc_html(get_bloginfo('version')); ?></td>
            </tr>
            <tr>
                <th><?php _e('PHP Version', 'imgfast-optimizer'); ?></th>
                <td><?php echo esc_html(PHP_VERSION); ?></td>
            </tr>
            <tr>
                <th><?php _e('Plugin Version', 'imgfast-optimizer'); ?></th>
                <td><?php echo esc_html(IMGFAST_VERSION); ?></td>
            </tr>
            <tr>
                <th><?php _e('Site URL', 'imgfast-optimizer'); ?></th>
                <td><?php echo esc_html(site_url()); ?></td>
            </tr>
        </table>
        <?php
    }

    /**
     * Get a sample image from media library
     *
     * @return string|null
     */
    private function get_sample_image() {
        $attachments = get_posts([
            'post_type' => 'attachment',
            'post_mime_type' => 'image',
            'posts_per_page' => 1,
            'orderby' => 'rand',
        ]);

        if (!empty($attachments)) {
            return wp_get_attachment_url($attachments[0]->ID);
        }

        return null;
    }

    /**
     * AJAX: Test CDN connection
     */
    public function ajax_test_connection() {
        check_ajax_referer('imgfast_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => __('Unauthorized', 'imgfast-optimizer')]);
        }

        $public_key = $this->settings->get('public_key');

        if (empty($public_key)) {
            wp_send_json_error(['message' => __('API key not configured', 'imgfast-optimizer')]);
        }

        $test_url = $this->settings->get_cdn_base_url() . '/health';
        $response = wp_remote_get($test_url, ['timeout' => 10]);

        if (is_wp_error($response)) {
            wp_send_json_error(['message' => $response->get_error_message()]);
        }

        $status_code = wp_remote_retrieve_response_code($response);

        if ($status_code >= 200 && $status_code < 400) {
            wp_send_json_success(['message' => __('Connection successful!', 'imgfast-optimizer')]);
        } else {
            wp_send_json_error([
                'message' => sprintf(__('CDN returned status %d', 'imgfast-optimizer'), $status_code)
            ]);
        }
    }

    /**
     * AJAX: Clear any local caches
     */
    public function ajax_clear_cache() {
        check_ajax_referer('imgfast_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => __('Unauthorized', 'imgfast-optimizer')]);
        }

        // Clear object cache if available
        wp_cache_flush();

        // Clear any transients
        delete_transient('imgfast_stats');

        wp_send_json_success(['message' => __('Cache cleared!', 'imgfast-optimizer')]);
    }

    /**
     * AJAX: Get usage stats
     */
    public function ajax_get_stats() {
        check_ajax_referer('imgfast_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => __('Unauthorized', 'imgfast-optimizer')]);
        }

        // In a real implementation, this would fetch from Imgfast API
        wp_send_json_success([
            'requests' => 0,
            'bandwidth' => '0 MB',
            'cache_hit_rate' => '0%',
        ]);
    }
}
