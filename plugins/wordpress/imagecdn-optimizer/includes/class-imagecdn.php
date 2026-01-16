<?php
/**
 * Main ImageCDN Plugin Class
 *
 * @package ImageCDN
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Main plugin class - Singleton pattern
 */
class ImageCDN {

    /**
     * Single instance
     *
     * @var ImageCDN|null
     */
    private static $instance = null;

    /**
     * Settings manager
     *
     * @var ImageCDN_Settings
     */
    private $settings;

    /**
     * URL rewriter
     *
     * @var ImageCDN_Rewriter
     */
    private $rewriter;

    /**
     * Blocks handler
     *
     * @var ImageCDN_Blocks
     */
    private $blocks;

    /**
     * Get singleton instance
     *
     * @return ImageCDN
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        $this->load_dependencies();
        $this->init_components();
        $this->init_hooks();
    }

    /**
     * Load required files
     */
    private function load_dependencies() {
        require_once IMAGECDN_PLUGIN_DIR . 'includes/class-imagecdn-settings.php';
        require_once IMAGECDN_PLUGIN_DIR . 'includes/class-imagecdn-rewriter.php';
        require_once IMAGECDN_PLUGIN_DIR . 'includes/class-imagecdn-admin.php';
        require_once IMAGECDN_PLUGIN_DIR . 'includes/class-imagecdn-blocks.php';
    }

    /**
     * Initialize components
     */
    private function init_components() {
        $this->settings = new ImageCDN_Settings();
        $this->rewriter = new ImageCDN_Rewriter($this->settings);
        $this->blocks = new ImageCDN_Blocks($this->settings);
    }

    /**
     * Initialize WordPress hooks
     */
    private function init_hooks() {
        // Load translations
        add_action('init', [$this, 'load_textdomain']);

        // Admin functionality
        if (is_admin()) {
            new ImageCDN_Admin($this->settings);
        }

        // Frontend URL rewriting
        add_action('template_redirect', [$this, 'maybe_init_rewriter']);

        // Initialize Gutenberg blocks
        $this->blocks->init();

        // REST API endpoints
        add_action('rest_api_init', [$this, 'register_rest_routes']);
    }

    /**
     * Load plugin text domain
     */
    public function load_textdomain() {
        load_plugin_textdomain(
            'imagecdn-optimizer',
            false,
            dirname(IMAGECDN_PLUGIN_BASENAME) . '/languages'
        );
    }

    /**
     * Initialize rewriter on frontend if enabled
     */
    public function maybe_init_rewriter() {
        if (!is_admin() && $this->settings->is_enabled()) {
            $this->rewriter->init();
        }
    }

    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        register_rest_route('imagecdn/v1', '/settings', [
            'methods' => 'GET',
            'callback' => [$this, 'rest_get_settings'],
            'permission_callback' => function () {
                return current_user_can('manage_options');
            },
        ]);

        register_rest_route('imagecdn/v1', '/transform-url', [
            'methods' => 'POST',
            'callback' => [$this, 'rest_transform_url'],
            'permission_callback' => '__return_true',
        ]);
    }

    /**
     * REST endpoint: Get settings
     *
     * @return WP_REST_Response
     */
    public function rest_get_settings() {
        return new WP_REST_Response([
            'enabled' => $this->settings->is_enabled(),
            'cdn_base_url' => $this->settings->get_cdn_base_url(),
            'default_quality' => $this->settings->get('default_quality'),
            'auto_webp' => $this->settings->get('auto_webp'),
        ]);
    }

    /**
     * REST endpoint: Transform URL
     *
     * @param WP_REST_Request $request
     * @return WP_REST_Response
     */
    public function rest_transform_url($request) {
        $url = $request->get_param('url');
        $params = $request->get_param('params') ?? [];

        if (empty($url)) {
            return new WP_REST_Response(['error' => 'URL is required'], 400);
        }

        $cdn_url = $this->rewriter->build_cdn_url($url, $params);

        return new WP_REST_Response([
            'original_url' => $url,
            'cdn_url' => $cdn_url,
        ]);
    }

    /**
     * Get settings instance
     *
     * @return ImageCDN_Settings
     */
    public function get_settings() {
        return $this->settings;
    }

    /**
     * Get rewriter instance
     *
     * @return ImageCDN_Rewriter
     */
    public function get_rewriter() {
        return $this->rewriter;
    }
}
