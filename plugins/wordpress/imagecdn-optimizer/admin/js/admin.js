/**
 * ImageCDN Admin JavaScript
 *
 * @package ImageCDN
 */

(function($) {
    'use strict';

    /**
     * ImageCDN Admin Handler
     */
    var ImageCDNAdmin = {
        /**
         * Initialize
         */
        init: function() {
            this.bindEvents();
            this.initQualityPreview();
        },

        /**
         * Bind event handlers
         */
        bindEvents: function() {
            $('#imagecdn-test-connection').on('click', this.testConnection.bind(this));
            $('#imagecdn-clear-cache').on('click', this.clearCache.bind(this));
            $('#imagecdn_public_key').on('blur', this.validateApiKey.bind(this));
            $('#imagecdn_quality').on('input', this.updateQualityLabel.bind(this));
        },

        /**
         * Test CDN connection
         */
        testConnection: function(e) {
            e.preventDefault();

            var $button = $(e.target);
            var $result = $('#imagecdn-test-result');

            $button.prop('disabled', true);
            $result
                .removeClass('success error')
                .html('<span class="spinner is-active"></span> ' + imagecdnAdmin.strings.testing);

            $.ajax({
                url: imagecdnAdmin.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'imagecdn_test_connection',
                    nonce: imagecdnAdmin.nonce
                },
                success: function(response) {
                    if (response.success) {
                        $result
                            .addClass('success')
                            .html('<span class="dashicons dashicons-yes-alt"></span> ' + response.data.message);
                    } else {
                        $result
                            .addClass('error')
                            .html('<span class="dashicons dashicons-warning"></span> ' + imagecdnAdmin.strings.error + ' ' + response.data.message);
                    }
                },
                error: function() {
                    $result
                        .addClass('error')
                        .html('<span class="dashicons dashicons-warning"></span> ' + imagecdnAdmin.strings.error + ' Network error');
                },
                complete: function() {
                    $button.prop('disabled', false);
                }
            });
        },

        /**
         * Clear cache
         */
        clearCache: function(e) {
            e.preventDefault();

            var $button = $(e.target);
            var $result = $button.next('.cache-result');

            $button.prop('disabled', true);
            $result.text(imagecdnAdmin.strings.clearing);

            $.ajax({
                url: imagecdnAdmin.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'imagecdn_clear_cache',
                    nonce: imagecdnAdmin.nonce
                },
                success: function(response) {
                    if (response.success) {
                        $result.text(imagecdnAdmin.strings.cleared);
                    } else {
                        $result.text(response.data.message);
                    }
                },
                error: function() {
                    $result.text('Error clearing cache');
                },
                complete: function() {
                    $button.prop('disabled', false);
                    setTimeout(function() {
                        $result.fadeOut(function() {
                            $(this).text('').show();
                        });
                    }, 3000);
                }
            });
        },

        /**
         * Validate API key format
         */
        validateApiKey: function(e) {
            var $input = $(e.target);
            var value = $input.val().trim();

            // Clear any previous validation state
            $input.removeClass('valid invalid');

            if (!value) {
                return;
            }

            // Check format: imgcdn_pk_xxxxx
            var pattern = /^imgcdn_pk_[a-zA-Z0-9]+$/;

            if (pattern.test(value)) {
                $input.addClass('valid');
            } else {
                $input.addClass('invalid');
                this.showFieldError($input, 'API key should be in format: imgcdn_pk_xxxxx');
            }
        },

        /**
         * Show field error message
         */
        showFieldError: function($field, message) {
            var $error = $field.next('.field-error');

            if (!$error.length) {
                $error = $('<span class="field-error" style="color: #d63638; display: block; margin-top: 5px;"></span>');
                $field.after($error);
            }

            $error.text(message);

            setTimeout(function() {
                $error.fadeOut(function() {
                    $(this).remove();
                });
            }, 5000);
        },

        /**
         * Initialize quality preview
         */
        initQualityPreview: function() {
            var $quality = $('#imagecdn_quality');

            if (!$quality.length) {
                return;
            }

            // Add quality label if not exists
            var $label = $quality.next('.quality-label');

            if (!$label.length) {
                $label = $('<span class="quality-label" style="margin-left: 10px; font-weight: 600;"></span>');
                $quality.after($label);
            }

            this.updateQualityLabel({ target: $quality[0] });
        },

        /**
         * Update quality label with visual indicator
         */
        updateQualityLabel: function(e) {
            var value = parseInt($(e.target).val(), 10);
            var $label = $(e.target).next('.quality-label');

            var text = value + '%';
            var color = '#00a32a'; // green

            if (value < 50) {
                text += ' (Low)';
                color = '#d63638'; // red
            } else if (value < 70) {
                text += ' (Medium)';
                color = '#dba617'; // yellow
            } else if (value <= 85) {
                text += ' (Recommended)';
                color = '#00a32a'; // green
            } else {
                text += ' (High)';
                color = '#2271b1'; // blue
            }

            $label.text(text).css('color', color);
        },

        /**
         * Copy to clipboard helper
         */
        copyToClipboard: function(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text);
            }

            // Fallback for older browsers
            var $temp = $('<textarea>');
            $('body').append($temp);
            $temp.val(text).select();
            document.execCommand('copy');
            $temp.remove();

            return Promise.resolve();
        }
    };

    // Initialize on document ready
    $(document).ready(function() {
        ImageCDNAdmin.init();
    });

})(jQuery);
