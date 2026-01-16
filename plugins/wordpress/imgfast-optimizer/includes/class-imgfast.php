<?php
/**
 * Main Imgfast Plugin Class
 *
 * @package Imgfast
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Main plugin class - Singleton pattern
 */
class Imgfast {

    /**
     * Single instance
     *
     * @var Imgfast|null
     */
    private static $instance = null;

    /**
     * Settings manager
     *
     * @var Imgfast_Settings
     */
    private $settings;

    /**
     * URL rewriter
     *
     * @var Imgfast_Rewriter
     */
    private $rewriter;

    /**
     * Blocks handler
     *
     * @var Imgfast_Blocks
     */
    private $blocks;

    /**
     * Get singleton instance
     *
     * @return Imgfast
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
        require_once IMGFAST_PLUGIN_DIR . 'includes/class-imgfast-settings.php';
        require_once IMGFAST_PLUGIN_DIR . 'includes/class-imgfast-rewriter.php';
        require_once IMGFAST_PLUGIN_DIR . 'includes/class-imgfast-admin.php';
        require_once IMGFAST_PLUGIN_DIR . 'includes/class-imgfast-blocks.php';
    }

    /**
     * Initialize components
     */
    private function init_components() {
        $this->settings = new Imgfast_Settings();
        $this->rewriter = new Imgfast_Rewriter($this->settings);
        $this->blocks = new Imgfast_Blocks($this->settings);
    }

    /**
     * Initialize WordPress hooks
     */
    private function init_hooks() {
        // Load translations
        add_action('init', [$this, 'load_textdomain']);

        // Admin functionality
        if (is_admin()) {
            new Imgfast_Admin($this->settings);
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
            'imgfast-optimizer',
            false,
            dirname(IMGFAST_PLUGIN_BASENAME) . '/languages'
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
        register_rest_route('imgfast/v1', '/settings', [
            'methods' => 'GET',
            'callback' => [$this, 'rest_get_settings'],
            'permission_callback' => function () {
                return current_user_can('manage_options');
            },
        ]);

        register_rest_route('imgfast/v1', '/transform-url', [
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
     * @return Imgfast_Settings
     */
    public function get_settings() {
        return $this->settings;
    }

    /**
     * Get rewriter instance
     *
     * @return Imgfast_Rewriter
     */
    public function get_rewriter() {
        return $this->rewriter;
    }
}
