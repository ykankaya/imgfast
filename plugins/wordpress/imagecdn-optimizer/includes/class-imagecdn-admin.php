<?php
/**
 * ImageCDN Admin Interface
 *
 * @package ImageCDN
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Admin settings page and functionality
 */
class ImageCDN_Admin {

    /**
     * Settings instance
     *
     * @var ImageCDN_Settings
     */
    private $settings;

    /**
     * Constructor
     *
     * @param ImageCDN_Settings $settings Settings instance
     */
    public function __construct(ImageCDN_Settings $settings) {
        $this->settings = $settings;

        add_action('admin_menu', [$this, 'add_menu_page']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);

        // AJAX handlers
        add_action('wp_ajax_imagecdn_test_connection', [$this, 'ajax_test_connection']);
        add_action('wp_ajax_imagecdn_clear_cache', [$this, 'ajax_clear_cache']);
        add_action('wp_ajax_imagecdn_get_stats', [$this, 'ajax_get_stats']);
    }

    /**
     * Add settings page to menu
     */
    public function add_menu_page() {
        add_options_page(
            __('ImageCDN Settings', 'imagecdn-optimizer'),
            __('ImageCDN', 'imagecdn-optimizer'),
            'manage_options',
            'imagecdn-settings',
            [$this, 'render_settings_page']
        );
    }

    /**
     * Register settings
     */
    public function register_settings() {
        register_setting(
            'imagecdn_settings',
            ImageCDN_Settings::OPTION_KEY,
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
        $sanitized['cdn_url'] = esc_url_raw($input['cdn_url'] ?? 'https://cdn.imagecdn.io');
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
        if ($hook !== 'settings_page_imagecdn-settings') {
            return;
        }

        wp_enqueue_style(
            'imagecdn-admin',
            IMAGECDN_PLUGIN_URL . 'admin/css/admin.css',
            [],
            IMAGECDN_VERSION
        );

        wp_enqueue_script(
            'imagecdn-admin',
            IMAGECDN_PLUGIN_URL . 'admin/js/admin.js',
            ['jquery'],
            IMAGECDN_VERSION,
            true
        );

        wp_localize_script('imagecdn-admin', 'imagecdnAdmin', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('imagecdn_admin'),
            'strings' => [
                'testing' => __('Testing connection...', 'imagecdn-optimizer'),
                'success' => __('Connection successful!', 'imagecdn-optimizer'),
                'error' => __('Connection failed:', 'imagecdn-optimizer'),
                'clearing' => __('Clearing cache...', 'imagecdn-optimizer'),
                'cleared' => __('Cache cleared!', 'imagecdn-optimizer'),
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
        <div class="wrap imagecdn-settings">
            <h1>
                <span class="dashicons dashicons-format-image"></span>
                <?php echo esc_html(get_admin_page_title()); ?>
            </h1>

            <?php if (!$this->settings->is_enabled()): ?>
            <div class="notice notice-warning">
                <p>
                    <?php _e('ImageCDN is not active. Enter your API key and enable the plugin to start optimizing images.', 'imagecdn-optimizer'); ?>
                    <a href="https://imagecdn.io/signup" target="_blank"><?php _e('Get your free API key', 'imagecdn-optimizer'); ?></a>
                </p>
            </div>
            <?php endif; ?>

            <nav class="nav-tab-wrapper">
                <a href="?page=imagecdn-settings&tab=general"
                   class="nav-tab <?php echo $active_tab === 'general' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('General', 'imagecdn-optimizer'); ?>
                </a>
                <a href="?page=imagecdn-settings&tab=advanced"
                   class="nav-tab <?php echo $active_tab === 'advanced' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('Advanced', 'imagecdn-optimizer'); ?>
                </a>
                <a href="?page=imagecdn-settings&tab=status"
                   class="nav-tab <?php echo $active_tab === 'status' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('Status', 'imagecdn-optimizer'); ?>
                </a>
            </nav>

            <form method="post" action="options.php">
                <?php
                settings_fields('imagecdn_settings');

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
                    <label for="imagecdn_enabled"><?php _e('Enable ImageCDN', 'imagecdn-optimizer'); ?></label>
                </th>
                <td>
                    <label>
                        <input type="checkbox"
                               name="<?php echo ImageCDN_Settings::OPTION_KEY; ?>[enabled]"
                               id="imagecdn_enabled"
                               value="1"
                               <?php checked($settings['enabled']); ?>>
                        <?php _e('Enable image optimization via ImageCDN', 'imagecdn-optimizer'); ?>
                    </label>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imagecdn_public_key"><?php _e('API Key (Public)', 'imagecdn-optimizer'); ?></label>
                </th>
                <td>
                    <input type="text"
                           name="<?php echo ImageCDN_Settings::OPTION_KEY; ?>[public_key]"
                           id="imagecdn_public_key"
                           value="<?php echo esc_attr($settings['public_key']); ?>"
                           class="regular-text"
                           placeholder="imgcdn_pk_xxxxxxxxxx">
                    <p class="description">
                        <?php _e('Enter your ImageCDN public key.', 'imagecdn-optimizer'); ?>
                        <a href="https://dashboard.imagecdn.io/api-keys" target="_blank"><?php _e('Get your API key', 'imagecdn-optimizer'); ?></a>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imagecdn_quality"><?php _e('Default Quality', 'imagecdn-optimizer'); ?></label>
                </th>
                <td>
                    <input type="number"
                           name="<?php echo ImageCDN_Settings::OPTION_KEY; ?>[default_quality]"
                           id="imagecdn_quality"
                           value="<?php echo esc_attr($settings['default_quality']); ?>"
                           min="1"
                           max="100"
                           class="small-text">
                    <p class="description">
                        <?php _e('Image quality (1-100). Lower values = smaller files. Recommended: 80', 'imagecdn-optimizer'); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imagecdn_auto_webp"><?php _e('Auto WebP/AVIF', 'imagecdn-optimizer'); ?></label>
                </th>
                <td>
                    <label>
                        <input type="checkbox"
                               name="<?php echo ImageCDN_Settings::OPTION_KEY; ?>[auto_webp]"
                               id="imagecdn_auto_webp"
                               value="1"
                               <?php checked($settings['auto_webp']); ?>>
                        <?php _e('Automatically serve WebP/AVIF based on browser support', 'imagecdn-optimizer'); ?>
                    </label>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imagecdn_lazy_load"><?php _e('Lazy Loading', 'imagecdn-optimizer'); ?></label>
                </th>
                <td>
                    <label>
                        <input type="checkbox"
                               name="<?php echo ImageCDN_Settings::OPTION_KEY; ?>[lazy_load]"
                               id="imagecdn_lazy_load"
                               value="1"
                               <?php checked($settings['lazy_load']); ?>>
                        <?php _e('Add native lazy loading to images', 'imagecdn-optimizer'); ?>
                    </label>
                </td>
            </tr>

            <tr>
                <th scope="row"><?php _e('Test Connection', 'imagecdn-optimizer'); ?></th>
                <td>
                    <button type="button" class="button" id="imagecdn-test-connection">
                        <?php _e('Test CDN Connection', 'imagecdn-optimizer'); ?>
                    </button>
                    <span id="imagecdn-test-result"></span>
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
                    <label for="imagecdn_cdn_url"><?php _e('CDN URL', 'imagecdn-optimizer'); ?></label>
                </th>
                <td>
                    <input type="url"
                           name="<?php echo ImageCDN_Settings::OPTION_KEY; ?>[cdn_url]"
                           id="imagecdn_cdn_url"
                           value="<?php echo esc_attr($settings['cdn_url']); ?>"
                           class="regular-text">
                    <p class="description">
                        <?php _e('Default: https://cdn.imagecdn.io', 'imagecdn-optimizer'); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imagecdn_custom_domain"><?php _e('Custom Domain', 'imagecdn-optimizer'); ?></label>
                </th>
                <td>
                    <input type="text"
                           name="<?php echo ImageCDN_Settings::OPTION_KEY; ?>[custom_domain]"
                           id="imagecdn_custom_domain"
                           value="<?php echo esc_attr($settings['custom_domain']); ?>"
                           class="regular-text"
                           placeholder="images.yourdomain.com">
                    <p class="description">
                        <?php _e('Use a custom domain for CDN URLs (requires Pro plan)', 'imagecdn-optimizer'); ?>
                    </p>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imagecdn_srcset"><?php _e('Responsive Images', 'imagecdn-optimizer'); ?></label>
                </th>
                <td>
                    <label>
                        <input type="checkbox"
                               name="<?php echo ImageCDN_Settings::OPTION_KEY; ?>[include_srcset]"
                               id="imagecdn_srcset"
                               value="1"
                               <?php checked($settings['include_srcset']); ?>>
                        <?php _e('Rewrite srcset attributes for responsive images', 'imagecdn-optimizer'); ?>
                    </label>
                </td>
            </tr>

            <tr>
                <th scope="row">
                    <label for="imagecdn_excluded"><?php _e('Excluded Paths', 'imagecdn-optimizer'); ?></label>
                </th>
                <td>
                    <textarea name="<?php echo ImageCDN_Settings::OPTION_KEY; ?>[excluded_paths]"
                              id="imagecdn_excluded"
                              rows="5"
                              class="large-text code"><?php echo esc_textarea(implode("\n", $settings['excluded_paths'])); ?></textarea>
                    <p class="description">
                        <?php _e('Enter paths to exclude (one per line). Images containing these paths will not be optimized.', 'imagecdn-optimizer'); ?>
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
        <div class="imagecdn-status-cards">
            <div class="imagecdn-status-card">
                <h3><?php _e('Connection Status', 'imagecdn-optimizer'); ?></h3>
                <p class="status-indicator <?php echo $this->settings->is_enabled() ? 'status-active' : 'status-inactive'; ?>">
                    <?php echo $this->settings->is_enabled()
                        ? __('Active', 'imagecdn-optimizer')
                        : __('Inactive', 'imagecdn-optimizer'); ?>
                </p>
            </div>

            <div class="imagecdn-status-card">
                <h3><?php _e('CDN URL', 'imagecdn-optimizer'); ?></h3>
                <code><?php echo esc_html($this->settings->get_cdn_base_url()); ?></code>
            </div>

            <div class="imagecdn-status-card">
                <h3><?php _e('Configuration', 'imagecdn-optimizer'); ?></h3>
                <ul>
                    <li><?php printf(__('Quality: %d%%', 'imagecdn-optimizer'), $settings['default_quality']); ?></li>
                    <li><?php printf(__('Auto WebP: %s', 'imagecdn-optimizer'), $settings['auto_webp'] ? __('Yes', 'imagecdn-optimizer') : __('No', 'imagecdn-optimizer')); ?></li>
                    <li><?php printf(__('Lazy Load: %s', 'imagecdn-optimizer'), $settings['lazy_load'] ? __('Yes', 'imagecdn-optimizer') : __('No', 'imagecdn-optimizer')); ?></li>
                    <li><?php printf(__('Srcset: %s', 'imagecdn-optimizer'), $settings['include_srcset'] ? __('Yes', 'imagecdn-optimizer') : __('No', 'imagecdn-optimizer')); ?></li>
                </ul>
            </div>
        </div>

        <h3><?php _e('Sample Transformed URL', 'imagecdn-optimizer'); ?></h3>
        <?php
        $sample_image = $this->get_sample_image();
        if ($sample_image):
            $rewriter = new ImageCDN_Rewriter($this->settings);
            $cdn_url = $rewriter->build_cdn_url($sample_image, ['width' => 800]);
        ?>
        <table class="widefat">
            <tr>
                <th><?php _e('Original URL', 'imagecdn-optimizer'); ?></th>
                <td><code><?php echo esc_html($sample_image); ?></code></td>
            </tr>
            <tr>
                <th><?php _e('CDN URL', 'imagecdn-optimizer'); ?></th>
                <td><code><?php echo esc_html($cdn_url); ?></code></td>
            </tr>
        </table>
        <?php else: ?>
        <p><?php _e('No images found in media library.', 'imagecdn-optimizer'); ?></p>
        <?php endif; ?>

        <h3><?php _e('System Information', 'imagecdn-optimizer'); ?></h3>
        <table class="widefat">
            <tr>
                <th><?php _e('WordPress Version', 'imagecdn-optimizer'); ?></th>
                <td><?php echo esc_html(get_bloginfo('version')); ?></td>
            </tr>
            <tr>
                <th><?php _e('PHP Version', 'imagecdn-optimizer'); ?></th>
                <td><?php echo esc_html(PHP_VERSION); ?></td>
            </tr>
            <tr>
                <th><?php _e('Plugin Version', 'imagecdn-optimizer'); ?></th>
                <td><?php echo esc_html(IMAGECDN_VERSION); ?></td>
            </tr>
            <tr>
                <th><?php _e('Site URL', 'imagecdn-optimizer'); ?></th>
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
        check_ajax_referer('imagecdn_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => __('Unauthorized', 'imagecdn-optimizer')]);
        }

        $public_key = $this->settings->get('public_key');

        if (empty($public_key)) {
            wp_send_json_error(['message' => __('API key not configured', 'imagecdn-optimizer')]);
        }

        $test_url = $this->settings->get_cdn_base_url() . '/health';
        $response = wp_remote_get($test_url, ['timeout' => 10]);

        if (is_wp_error($response)) {
            wp_send_json_error(['message' => $response->get_error_message()]);
        }

        $status_code = wp_remote_retrieve_response_code($response);

        if ($status_code >= 200 && $status_code < 400) {
            wp_send_json_success(['message' => __('Connection successful!', 'imagecdn-optimizer')]);
        } else {
            wp_send_json_error([
                'message' => sprintf(__('CDN returned status %d', 'imagecdn-optimizer'), $status_code)
            ]);
        }
    }

    /**
     * AJAX: Clear any local caches
     */
    public function ajax_clear_cache() {
        check_ajax_referer('imagecdn_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => __('Unauthorized', 'imagecdn-optimizer')]);
        }

        // Clear object cache if available
        wp_cache_flush();

        // Clear any transients
        delete_transient('imagecdn_stats');

        wp_send_json_success(['message' => __('Cache cleared!', 'imagecdn-optimizer')]);
    }

    /**
     * AJAX: Get usage stats
     */
    public function ajax_get_stats() {
        check_ajax_referer('imagecdn_admin', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => __('Unauthorized', 'imagecdn-optimizer')]);
        }

        // In a real implementation, this would fetch from ImageCDN API
        wp_send_json_success([
            'requests' => 0,
            'bandwidth' => '0 MB',
            'cache_hit_rate' => '0%',
        ]);
    }
}
