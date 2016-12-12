(function($) {

    $.ManifestsPanel = function(options) {

        jQuery.extend(true, this, {
            element:                    null,
            listItems:                  null,
            appendTo:                   null,
            manifestListItems:          [],
            manifestListElement:        null,
            manifestLoadStatusIndicator: null,
            resultsWidth:               0,
            state:                      null,
            eventEmitter:               null
        }, options);

        var _this = this;
        _this.init();
        
    };

    $.ManifestsPanel.prototype = {

        init: function() {
            this.element = jQuery(this.template({
                showURLBox : this.state.getStateProperty('showAddFromURLBox')
            })).appendTo(this.appendTo);
            this.manifestListElement = this.element.find('ul');
            
            //this code gives us the max width of the results area, used to determine how many preview images to show
            //cloning the element and adjusting the display and visibility means it won't break the normal flow
            var clone = this.element.clone().css("visibility","hidden").css("display", "block").appendTo(this.appendTo);
            this.resultsWidth = clone.find('.select-results').outerWidth();
            this.controlsHeight = clone.find('.manifest-panel-controls').outerHeight();
            this.paddingListElement = this.controlsHeight;
            this.manifestListElement.css("padding-bottom", this.paddingListElement);
            clone.remove();
            
            // this.manifestLoadStatusIndicator = new $.ManifestLoadStatusIndicator({
            //   manifests: this.parent.manifests,
            //   appendTo: this.element.find('.select-results')
            // });
            this.bindEvents();
            this.listenForActions();
        },

        listenForActions: function() {
          var _this = this;

          // handle subscribed events
          _this.eventEmitter.subscribe('manifestsPanelVisible.set', function(_, stateValue) {
            _this.onPanelVisible(_, stateValue);
          });

          _this.eventEmitter.subscribe('manifestReceived', function(event, newManifest) {
            _this.onManifestReceived(event, newManifest);
          });
        },

        bindEvents: function() {
            var _this = this,
                dropTarget = this.element.find('.dropMask');

            // DnD tests
            this.element.on('dragover', function(e) {
              e.preventDefault();
              dropTarget.show();
            });
            dropTarget.on('dragenter', function(e) {
              e.preventDefault();
              _this.element.addClass('draggedOver');
            });
            dropTarget.on('dragleave', function(e) {
              e.preventDefault();
              _this.element.removeClass('draggedOver');
              dropTarget.hide();
            });
            this.element.on('drop', function(e) {
              _this.element.removeClass('draggedOver');
              dropTarget.hide();
              _this.dropItem(e);
            });
            // end DnD tests

            // handle interface events
            this.element.find('form#url-load-form').on('submit', function(event) {
              event.preventDefault();
              _this.addManifestUrl(jQuery(this).find('input').val());
            });

            this.element.find('.remove-object-option').on('click', function(event) {
              _this.togglePanel(event);
            });

            // Filter manifests based on user input
            this.element.find('#manifest-search').on('keyup input', function(event) {
              _this.filterManifests(this.value);
            });

            this.element.find('#manifest-search-form').on('submit', function(event) {
              event.preventDefault();
            });

            jQuery(window).resize($.throttle(function() {
              _this.resizePanel();
            }, 50, true));
        },

        // DnD tests
        dropItem: function(e) {
          var _this = this;

          e.preventDefault();
          var text_url = e.originalEvent.dataTransfer.getData("text/plain");
          if (text_url) {
            _this.handleDrop(text_url);
          } else {
            e.originalEvent.dataTransfer.items[0].getAsString(function(url) {
              _this.handleDrop(url);
            });
          }
        },

        handleDrop: function(url) {
          var _this = this;

          url = url || text_url;
          var manifestUrl = $.getQueryParams(url).manifest || url,
              collectionUrl = $.getQueryParams(url).collection,
              canvasId = $.getQueryParams(url).canvas,
              imageInfoUrl = $.getQueryParams(url).image,
              windowConfig;

          if (typeof _this.state.getStateProperty('manifests')[manifestUrl] !== 'undefined') {
            windowConfig = {
              manifest: _this.state.getStateProperty('manifests')[manifestUrl]
            };

            if (canvasId) {
              // If the canvasID is defined, we need to both add
              // it to the windowConfig and tell it to open in
              // image view. If we don't specify the focus, the
              // window will open in thumbnail view with the
              // chosen page highlighted.
              windowConfig.canvasID = canvasId;
              windowConfig.viewType = 'ImageView';
              _this.eventEmitter.publish('ADD_WINDOW', windowConfig);
            }

            _this.eventEmitter.publish('ADD_MANIFEST_FROM_URL', manifestUrl, "(Added by drag and drop)");

          }
          
          else if (typeof imageInfoUrl !== 'undefined') {
            if (!_this.state.getStateProperty('manifests')[imageInfoUrl]) {
              _this.eventEmitter.publish('ADD_MANIFEST_FROM_URL', imageInfoUrl, "(Added from URL)");
            }
          } 
          else if (typeof collectionUrl !== 'undefined'){
            jQuery.getJSON(collectionUrl).done(function (data, status, jqXHR) {
              if (data.hasOwnProperty('manifests')){
                jQuery.each(data.manifests, function (ci, mfst) {
                  if (!_this.state.getStateProperty('manifests')[imageInfoUrl]) {
                    _this.eventEmitter.publish('ADD_MANIFEST_FROM_URL', mfst['@id'], "(Added from URL)");
                  }
                });
              }
            });

            //TODO: 
            //this works;
            //but you might want to check if some "publish" action would be better
            _this.addItem();
            
          }
          else {
            if (!_this.state.getStateProperty('manifests')[imageInfoUrl]) {
              _this.eventEmitter.publish('ADD_MANIFEST_FROM_URL', manifestUrl, "(Added from URL)");
            }
          }

          _this.eventEmitter.subscribe('manifestReceived', function(event, manifest) {
            var windowConfig;
            if (manifest.jsonLd['@id'] === manifestUrl || manifest.jsonLd['@id']+'/info.json' === imageInfoUrl) {
              // There are many manifests that may be received
              // while we are waiting for this one, so we
              // need to make sure the event actually refers to the
              // manifest we've just dropped.

              windowConfig = {
                manifest: manifest
              };

              if (manifest.jsonLd['@id']+'/info.json' === imageInfoUrl) {
                // If this was added from a naked info.json, pick the
                // first (and only) page from the synthetic manifest.
                canvasId = manifest.jsonLd.sequences[0].canvases[0]['@id'];
              }

              if (canvasId) {
                // If the canvasID is defined, we need to both add
                // it to the windowConfig and tell it to open in
                // image view. If we don't specify the focus, the
                // window will open in thumbnail view with the
                // chosen page highlighted.
                windowConfig.canvasID = canvasId;
                windowConfig.viewType = 'ImageView';
                _this.eventEmitter.publish('ADD_WINDOW', windowConfig);
              }

              _this.eventEmitter.publish('ADD_MANIFEST_FROM_URL', manifest.jsonLd['@id'], "(Added by drag and drop)");
            }
          });
        },
        // end DnD tests
        
        hide: function() {
            var _this = this;
            jQuery(this.element).hide({effect: "fade", duration: 160, easing: "easeOutCubic"});
        },

        show: function() {
            var _this = this;
            jQuery(this.element).show({effect: "fade", duration: 160, easing: "easeInCubic"});
        },
        
        addManifestUrl: function(url) {
          var _this = this;
          _this.eventEmitter.publish('ADD_MANIFEST_FROM_URL', url, "(Added from URL)");
        },
        
        togglePanel: function(event) {
          var _this = this;
          _this.eventEmitter.publish('TOGGLE_LOAD_WINDOW');
        },
        
        filterManifests: function(value) {
          var _this = this;
          if (value.length > 0) {
             _this.element.find('.items-listing li').show().filter(function() {
                return jQuery(this).text().toLowerCase().indexOf(value.toLowerCase()) === -1;
             }).hide();
          } else {
             _this.element.find('.items-listing li').show();
          }
        },

        resizePanel: function() {
          var _this = this;
          var clone = _this.element.clone().css("visibility","hidden").css("display", "block").appendTo(_this.appendTo);
          _this.resultsWidth = clone.find('.select-results').outerWidth();
          clone.remove();
          _this.eventEmitter.publish("manifestPanelWidthChanged", _this.resultsWidth);
        },
        
        onPanelVisible: function(_, stateValue) {
          var _this = this;
          if (stateValue) { _this.show(); return; }
           _this.hide();
        },

        onManifestReceived: function(event, newManifest) {
          var _this = this;
          _this.manifestListItems.push(new $.ManifestListItem({ 
            manifest: newManifest, 
            resultsWidth: _this.resultsWidth, 
            state: _this.state,
            eventEmitter: _this.eventEmitter,
            appendTo: _this.manifestListElement }));
          _this.element.find('#manifest-search').keyup();
        },

        template: Handlebars.compile([
          '<div id="manifest-select-menu">',
          '<div class="container">',
            '<div class="manifest-panel-controls">',
              '<a class="remove-object-option"><i class="fa fa-times fa-lg fa-fw"></i>{{t "close"}}</a>',
              '<div id="load-controls">',
                '{{#if showURLBox}}',
                  '<form action="" id="url-load-form">',
                    '<label for="url-loader">{{t "addNewObject"}}:</label>',
                    '<input type="text" id="url-loader" name="url-load" placeholder="http://...">',
                    '<input type="submit" value="{{t "load"}}">',
                  '</form>',
                '{{/if}}',
                '<form action="" id="manifest-search-form">',
                  '<label for="manifest-search">{{t "filterObjects"}}:</label>',
                  '<input id="manifest-search" type="text" name="manifest-filter">',
                '</form>',
              '</div>',
            '</div>',
              '<div class="select-results">',
                '<ul class="items-listing">',
                '</ul>',
                '<a class="dropMask"></a>',
              '</div>',
          '</div>',
          '</div>'
        ].join(''))
    };

}(Mirador));

