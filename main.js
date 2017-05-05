// Pull in your favorite version of jquery 
require({ 
	packages: [{ name: "jquery", location: "http://ajax.googleapis.com/ajax/libs/jquery/2.1.0/", main: "jquery.min" }] 
});
// Bring in dojo and javascript api classes as well as varObject.json, js files, and content.html
define([
	"dojo/_base/declare", "dojo/_base/lang", "dojo/_base/Color",  "dojo/_base/array", "framework/PluginBase", "dijit/layout/ContentPane", "dojo/dom", "dojo/dom-style", 
	"dojo/dom-geometry", "dojo/text!./obj.json", "dojo/text!./html/content.html", './js/esriapi', './js/clicks',
	'dojo/text!./config.json', 'dojo/text!./filters.json', "esri/layers/ImageParameters", "esri/layers/FeatureLayer", "esri/layers/GraphicsLayer",
	 "esri/graphic", "esri/symbols/SimpleMarkerSymbol", "esri/tasks/IdentifyTask", "esri/tasks/IdentifyParameters", "esri/InfoTemplate","esri/renderers/SimpleRenderer",
],
function ( 	declare, lang, Color, arrayUtils, PluginBase, ContentPane, dom, domStyle, domGeom, obj, content, esriapi, clicks, config, filters, ImageParameters, 
	FeatureLayer, GraphicsLayer, Graphic, SimpleMarkerSymbol, IdentifyTask, IdentifyParameters, InfoTemplate, SimpleRenderer) {
	return declare(PluginBase, {
		// The height and width are set here when an infographic is defined. When the user click Continue it rebuilds the app window with whatever you put in.
		toolbarName: "Aquatic Barrier Prioritization", showServiceLayersInLegend: true, allowIdentifyWhenActive: true, rendered: false, resizable: false,
		hasCustomPrint: false, size:'small',
		
		// First function called when the user clicks the pluging icon. 
		initialize: function (frameworkParameters) {
			// Access framework parameters
			declare.safeMixin(this, frameworkParameters);
			// Define object to access global variables from JSON object. Only add variables to varObject.json that are needed by Save and Share. 
			this.obj = dojo.eval("[" + obj + "]")[0];	
			this.config = dojo.eval("[" + config + "]")[0];
			this.filters = dojo.eval("[" + filters + "]")[0]; 
			console.log(this.filters);
			this.url = this.config.url;
			this.layerDefs = [0];
			this.gp = new esri.tasks.Geoprocessor(this.config.gpURL);
            this.gp.setUpdateDelay(200); //status check in milliseconds;
			
		},
		// Called after initialize at plugin startup (why the tests for undefined). Also called after deactivate when user closes app by clicking X. 
		hibernate: function () {
			if (this.appDiv != undefined){
				this.dynamicLayer.setVisibleLayers([-1]);
			}
			this.open = "no";
			
		},
		// Called after hibernate at app startup. Calls the render function which builds the plugins elements and functions.   
		activate: function () {
			$('#' + this.id + 'mainAccord').css("display", "none");
			if (this.rendered == false) {
				this.rendered = true;							
				this.render();
				$(this.printButton).hide();
			}else{
				this.dynamicLayer.setVisibleLayers(this.obj.visibleLayers);
				$('#' + this.id).parent().parent().css('display', 'flex');
				this.clicks.updateAccord(this);
			}	
			
			this.open = "yes";
		},
		// Called when user hits the minimize '_' icon on the pluging. Also called before hibernate when users closes app by clicking 'X'.
		deactivate: function () {
			this.open = "no";	
		},	
		// Called when user hits 'Save and Share' button. This creates the url that builds the app at a given state using JSON. 
		// Write anything to you varObject.json file you have tracked during user activity.		
		getState: function () {
			// remove this conditional statement when minimize is added
			if ( $('#' + this.id ).is(":visible") ){
				//accordions
				if ( $('#' + this.id + 'mainAccord').is(":visible") ){
					this.obj.accordVisible = 'mainAccord';
					this.obj.accordHidden = 'infoAccord';
				}else{
					this.obj.accordVisible = 'infoAccord';
					this.obj.accordHidden = 'mainAccord';
				}	
				this.obj.accordActive = $('#' + this.id + this.obj.accordVisible).accordion( "option", "active" );
				// main button text
				this.obj.buttonText = $('#' + this.id + 'getHelpBtn').html();
				//extent
				this.obj.extent = this.map.geographicExtent;
				this.obj.stateSet = "yes";	
				var state = new Object();
				state = this.obj;
				console.log(this.obj);
				return state;	
			}
		},
		// Called before activate only when plugin is started from a getState url. 
		//It's overwrites the default JSON definfed in initialize with the saved stae JSON.
		setState: function (state) {
			this.obj = state;
		},
		// Called when the user hits the print icon
		beforePrint: function(printDeferred, $printArea, mapObject) {
			printDeferred.resolve();
		},	
		// Called by activate and builds the plugins elements and functions
		render: function() {
			//this.oid = -1;
			//$('.basemap-selector').trigger('change', 3);
			this.mapScale  = this.map.getScale();
			// BRING IN OTHER JS FILES
			this.esriapi = new esriapi();
			this.clicks = new clicks();
			
			
			// ADD HTML TO APP
			// Define Content Pane as HTML parent		
			this.appDiv = new ContentPane({style:'padding:0; color:#000; flex:1; display:flex; flex-direction:column;}'});
			this.id = this.appDiv.id;
			dom.byId(this.container).appendChild(this.appDiv.domNode);	
			$('#' + this.id).parent().addClass('flexColumn');
			$('#' + this.id).addClass('accord');
			if (this.obj.stateSet == "no"){
				$('#' + this.id).parent().parent().css('display', 'flex');
			}		
			// Get html from content.html, prepend appDiv.id to html element id's, and add to appDiv
			var idUpdate0 = content.replace(/for="/g, 'for="' + this.id);	
			var idUpdate = idUpdate0.replace(/id="/g, 'id="' + this.id);
			$('#' + this.id).html(idUpdate);
			
			console.log($('#' + this.id + 'rslider'));
			// Click listeners
			this.clicks.appSetup(this);
			// Create ESRI objects and event listeners	
			this.esriapi.esriApiFunctions(this);
			
			//set varaibles
			this.severityDict = {5:"Severe", 4:"Significant", 3:"Moderate", 2:"Minor", 1:"Insignificant"};
			this.activateIdentify = true;
			lang.hitch(this, this.refreshIdentify(this.url));
			this.uniqueID = this.config.uniqueID;
			this.barriers2RemoveCount = 0;       
            this.workingRemoveBarriers = [];
            this.workingRemoveBarriersString = "";
   

			if (this.config.includeExploreConsensus == true){
				//Consensus Tier Slider
				$('#' + this.id + 'consensusResultFilterSliderTier').slider({
					range:true, 
					min:1, 
					max:20, 
					values:[1,20],
					values: [this.obj.startingConsensusTierFilterMin, this.obj.startingConsensusTierFilterMax],
					// called at end of slide. use change to ask server for data
					change:lang.hitch(this,function(event,ui){
						console.log(ui.values);
						lang.hitch(this, this.filterConsensusMapServiceSlider());
						this.consensusResultFilterSliderTierUI = ui;
					}),
					// called at each increment of slide
					slide:lang.hitch(this,function(event,ui){
						sliderID = '#' + this.id + 'consensusResultFilterSliderTier';
						lang.hitch(this, this.displaySliderSelectedValues(sliderID, ui));
					})
				});
		
				//Consensus Severity Slider
				$('#' + this.id + 'consensusResultFilterSliderSeverity').slider({
					range:true, 
					min:1, 
					max:5, 
					values: [this.obj.startingConsensusSeverityFilterMin, this.obj.startingConsensusSeverityFilterMax],
					// called at end of slide. use change to ask server for data
					change:lang.hitch(this,function(event,ui){
						console.log(ui.values);
						lang.hitch(this, this.filterConsensusMapServiceSlider());
						this.consensusResultFilterSliderSeverityUI = ui;
					}),
					// called at each increment of slide
					slide:lang.hitch(this,function(event,ui){
						sliderID = '#' + this.id + 'consensusResultFilterSliderSeverity';
						lang.hitch(this, this.displaySliderSelectedValues(sliderID, ui));
					})
				});
				

            	//Consensus Results custom filter builder
            	this.consensusResultFilterField = "";
                this.consensusResultFilterOperator ="";
                this.consensusResultFilterValue = "";       
                this.consensusResultFilterFieldList = "";
                for (var i=0; i< this.filters.resultFilters.resultFilterFields.length; i++){
                    this.consensusResultFilterFieldList += "<option value='" + this.filters.resultFilters.resultFilterFields[i].resultGISName + "'>" + this.filters.resultFilters.resultFilterFields[i].resultPrettyName + "</option>";
				}
                $("#" + this.id + "filterConsensusResultsField").html(this.consensusResultFilterFieldList);
					
                this.updateConsensusResultValues = (lang.hitch(this,function (field){    
                    this.fieldValsList = "";
                    for (var i=0; i < this.filters.resultFilters.resultValuesTable[field].length; i++){
	                    if (this.filters.resultFilters.resultValuesTable[field][i].resultValuePrettyName != undefined){
                    		this.fieldValsList += "<option value='" + this.filters.resultFilters.resultValuesTable[field][i].resultValue + "'>" + this.filters.resultFilters.resultValuesTable[field][i].resultValuePrettyName + "</option>";
                    	}
                    	else{
                        	this.fieldValsList += "<option value='" + this.filters.resultFilters.resultValuesTable[field][i].resultValue + "'>" + this.filters.resultFilters.resultValuesTable[field][i].resultValue + "</option>";
                    	}
                    }
                    $("#" + this.id + "filterConsensusResultsValue").html(this.fieldValsList);        
                        $(".chosen").trigger("chosen:updated");
                        this.consensusResultFilterValue = $("#" + this.id + "filterConsensusResultsValue").val();
                        //set operator to = as a default
                        if (this.consensusResultFilterOperator == ""){
                            $('#'+ this.id +"filterConsensusResultsOperator").val($('#'+ this.id +"filterConsensusResultsOperator option:eq(1)").val());
                             $(".chosen").trigger("chosen:updated");
                            this.consensusResultFilterOperator = $("#" + this.id + "filterConsensusResultsOperator").val();
                        }
                        $("#" + this.id + "resultsConsensusFilter").val( this.consensusResultFilterField + ' ' + this.consensusResultFilterOperator + " (" + this.consensusResultFilterValue + ")");
                }));
                
                $("#" + this.id + "filterConsensusResultsField").on('change',lang.hitch(this,function(e){
                     $(".chosen").trigger("chosen:updated");
                    this.consensusSelectedField = $("#" + this.id + "filterConsensusResultsField option:selected").text();
                    this.updateConsensusResultValues(this.consensusSelectedField);
					this.consensusResultFilterField = $("#" + this.id + "filterConsensusResultsField").val();
                    $("#" + this.id + "resultsConsensusFilter").val( this.consensusResultFilterField + ' ' + this.consensusResultFilterOperator + " (" + this.consensusResultFilterValue + ")");
                }));
				
                $("#" + this.id + "filterConsensusResultsOperator").on('change',lang.hitch(this,function(e){
                    console.log("filter change");
                    this.consensusResultFilterOperator = $("#" + this.id + "filterConsensusResultsOperator").val();
                    $("#" + this.id + "resultsConsensusFilter").val(this.consensusResultFilterField + ' ' + this.consensusResultFilterOperator + " (" + this.consensusResultFilterValue + ")");
                }));
                $("#" + this.id + "filterConsensusResultsValue").on('change',lang.hitch(this,function(e){
                    this.consensusResultFilterValue = $("#" + this.id + "filterConsensusResultsValue").val();
                    $("#" + this.id + "resultsConsensusFilter").val(this.consensusResultFilterField + ' ' + this.consensusResultFilterOperator + " (" + this.consensusResultFilterValue + ")");
                })); 
				
				$("#"+ this.id + "filterConsensusResultsField").chosen({allow_single_deselect:true, width:"110px"});
				$("#"+ this.id + "filterConsensusResultsValue").chosen({allow_single_deselect:true, width:"125px"});
				$("#"+ this.id + "filterConsensusResultsOperator").chosen({allow_single_deselect:true, width:"50px"});
				
                //applyFilter to Consensus results
                $("#" + this.id +"applyResultConsensusFilterButton").on('click',lang.hitch(this,function(e){
                	this.consensusCustomFilter = $("#" + this.id + "resultsConsensusFilter").val();
                	console.log(this.consensusCustomFilter);
                	this.map.removeLayer(this.dynamicLayer);
                	this.dynamicLayer = this.filterMapService(this.consensusCustomFilter, this.dynamicLayer, this.config.url); 
					console.log(this.dynamicLayer);
					this.dynamicLayer.setVisibleLayers(this.config.visibleLayers);
				
					setTimeout(lang.hitch(this, function(){
					    this.map.addLayer(this.dynamicLayer);
					},500));		
					lang.hitch(this, this.refreshIdentify(this.config.url, this.consensusCustomFilter));	                 
                }));
                
                //clear filter from consensus results
                $('#' + this.id +'clearResultConsensusFilterButton').on('click',lang.hitch(this,function(e){
                	lang.hitch(this,this.clearConsensusFilterMapService());  
                	lang.hitch(this, this.filterConsensusMapServiceSlider());       
                }));
			};
			
		    //set up metric weight tabs
            jQuery('.tabs .tab-links a').on('click', function(e)  {
                tabIDprefix = this.id.split("tab")[0];
                mapSide = tabIDprefix.replace("weightIn", "");
                var currentAttrValue = mapSide + jQuery(this).attr('href');
                currentAttrValue = "#" + currentAttrValue;
                // Show/Hide Tabs
                jQuery('.tabs ' + currentAttrValue).show().siblings().hide();
                // Change/remove current tab to active
                jQuery(this).parent('li').addClass('active').siblings().removeClass('active'); 
                e.preventDefault();
            });
        	
     
        	//show metric weights tabs if yes is selected
        	$('#'+ this.id +"customWeightsDiv").hide();
        	$("input[name='useConsensusWeights']").on('change',lang.hitch(this,function(){
				if ($("input[name='useConsensusWeights']:checked").val() =="yes"){
					$('#'+ this.id +"customWeightsDiv").show();
				}
	        	else{$('#'+ this.id +"customWeightsDiv").hide();}
        	}));
        	
            //set up listener for change to metric weight inputs
            $("input[id^=" +  this.id + 'weightIn]').on('input', lang.hitch(this, function(e){  
            	              
                e.currentTarget.value = parseInt(e.currentTarget.value);
                  
                if (isNaN(parseFloat(e.currentTarget.value)) == true){e.currentTarget.value = 0;}
                this.gpVals = {};
                this.weights = $("input[id^=" + this.id + "weightIn]").each(lang.hitch(this, function(i, v){
                    if (isNaN(parseFloat(v.value)) == true){v.id = 0;} 
                    if (v.value ==""){v.id = 0;}
                    else{this.gpVals[v.id] = v.value;}      
                    this.gpVals[v.id] = v.value;
                    if (parseFloat(v.value) > 0){$('#' + v.id).addClass('weighted');}
                    else{$('#' + v.id).removeClass('weighted');}                                
                }));
                this.sumWeights = this.metricWeightCalculator(this.gpVals);
                $('#'+ this.id + "currWeight").text(this.sumWeights);
                if (this.sumWeights !=100){
                    $('#'+ this.id +"currWeight").css('color', 'red');
                }
                if (this.sumWeights ==100){
                    $('#'+ this.id +"currWeight").css('color', 'green');
                } 
            }));
			
        	//FILTER BUILDER listener to fill in filter as drop downs are used
        	//Only show the filter build if its being used
        	$('#'+ this.id +"filterBuilderContainer").hide();
        	$("input[name='filterBarriers']").on('change',lang.hitch(this,function(){
				if ($("input[name='filterBarriers']:checked").val() =="yes"){
					$('#'+ this.id +"filterBuilderContainer").show();
				}
	        	else{$('#'+ this.id +"filterBuilderContainer").hide();}
        	}));
            this.filterField = "";
            this.filterOperator ="";
            this.filterValue = "";       
            this.filterFieldList = "";
            for (var i=0; i< this.filters.inputFilters.metricNamesTable.length; i++){
                this.filterFieldList += "<option value='" + this.filters.inputFilters.metricNamesTable[i].metricGISName + "'>" + this.filters.inputFilters.metricNamesTable[i].metricPrettyName + "</option>";
			}
            $("#" + this.id + "filterBuildField").html(this.filterFieldList);
            this.updateMetricValues = (lang.hitch(this,function (metric){    
                this.metricValsList = "";
                for (var i=0; i < this.filters.inputFilters.metricValuesTable[metric].length; i++){
                	if (this.filters.inputFilters.metricValuesTable[metric][i].metricValuePrettyName !=undefined){
                		this.metricValsList += "<option value='" + this.filters.inputFilters.metricValuesTable[metric][i].metricValue + "'>" + this.filters.inputFilters.metricValuesTable[metric][i].metricValuePrettyName + "</option>";
                	}
                	else{
                    	this.metricValsList += "<option value='" + this.filters.inputFilters.metricValuesTable[metric][i].metricValue + "'>" + this.filters.inputFilters.metricValuesTable[metric][i].metricValue + "</option>";
                	}
                }
                $("#" + this.id + "filterBuildValue").html(this.metricValsList);
                this.filterValue = $("#" + this.id + "filterBuildValue").val();
                $(".chosen").trigger("chosen:updated");
            
                //set operator to = as a default
                if (this.filterOperator == ""){
                    //$("#" + this.id + "filterBuildOperator").val("=");
                    $('#'+ this.id +"filterBuildOperator").val($('#'+ this.id +"filterBuildOperator option:eq(1)").val());
                    $(".chosen").trigger("chosen:updated");
                    this.filterOperator = $("#" + this.id + "filterBuildOperator").val();
                }
                $("#" + this.id + "userFilter").val('"' + this.filterField + '" ' + this.filterOperator + " (" + this.filterValue + ")");
            }));
            $("#" + this.id + "filterBuildField").on('change',lang.hitch(this,function(e){
                this.selectedMetric = $("#" + this.id + "filterBuildField option:selected").text();
                this.updateMetricValues(this.selectedMetric);
				this.filterField = $("#" + this.id + "filterBuildField").val(); 
                $("#" + this.id + "userFilter").val('"' + this.filterField + '" ' + this.filterOperator + " (" + this.filterValue + ")");
            }));
            $(".chosen").trigger("chosen:updated");
            $("#" + this.id + "filterBuildOperator").on('change',lang.hitch(this,function(e){
                this.filterOperator = $("#" + this.id + "filterBuildOperator").val();
                $("#" + this.id + "userFilter").val('"' + this.filterField + '" ' + this.filterOperator + " (" + this.filterValue + ")");
            }));
            $("#" + this.id + "filterBuildValue").on('change',lang.hitch(this,function(e){
                this.filterValue = $("#" + this.id + "filterBuildValue").val();
                $("#" + this.id + "userFilter").val('"' + this.filterField + '" ' + this.filterOperator + " (" + this.filterValue + ")");
            }));      
			$("#"+ this.id + "passability").chosen({allow_single_deselect:true, width:"110px"});
			$("#"+ this.id + "filterBuildField").chosen({allow_single_deselect:true, width:"110px"});
			$("#"+ this.id + "filterBuildValue").chosen({allow_single_deselect:true, width:"125px"});
			$("#"+ this.id + "filterBuildOperator").chosen({allow_single_deselect:true, width:"50px"});
			$("#"+ this.id + "summarizeBy").chosen({allow_single_deselect:true, width:"110px"});
			$("#"+ this.id + "summaryStatField").chosen({allow_single_deselect:true, width:"110px"});
			
			//show barriers to remove if yes is selected
        	$('#'+ this.id +"barriers2RemoveContainer").hide();
        	$("input[name='removeBarriers']").on('change',lang.hitch(this,function(){
				if ($("input[name='removeBarriers']:checked").val() =="yes"){
					$('#'+ this.id +"barriers2RemoveContainer").show();
				}
	        	else{$('#'+ this.id +"barriers2RemoveContainer").hide();}
        	}));
			
			//show sum stats tabs if yes is selected
        	$('#'+ this.id +"sumStatsContainer").hide();
        	$("input[name='runSumStats']").on('change',lang.hitch(this,function(){
				if ($("input[name='runSumStats']:checked").val() =="yes"){
					$('#'+ this.id +"sumStatsContainer").show();
				}
	        	else{$('#'+ this.id +"cumStatsContainer").hide();}
        	}));
        	
			//Set up select barriers to remove button
			$('#'+ this.id +'graphicSelectBarriers2Remove').on('click', lang.hitch(this, function(){
				this.selectRemovalBarriers();
			}));
			
			//apply starting weights
            lang.hitch(this, this.applyWeights(this.obj.startingWeights));
            
           	//apply starting passability
			if (this.obj.startingPassability != ""){
				$("#" + this.id + "passability").val(this.obj.startingPassability);
			}
           
			//apply starting filter
			if (this.obj.startingFilter != ""){
				$("#" + this.id + 'filterBarriers').prop('checked', true);
				lang.hitch(this, this.showFilterInputs());
				$("#" + this.id + "userFilter").val(this.obj.startingFilter);
			}
			
			//apply starting barriers to remove
			if (this.obj.startingBarriers2Remove != ""){
				this.removingBarriers = true;
				$("#" + this.id + 'removeBarriers').prop('checked', true);
				$("#" + this.id + 'barriers2Remove').show();
				$("#" + this.id + 'barriers2Remove').val(this.obj.startingBarriers2Remove);
			}
		
			//apply starting summary stats inputs
			if (this.obj.startingSummarizeBy != "" ||this.obj.startingSummaryStatField != ""){
				$("#" + this.id + 'runSumStats').prop('checked', true);
				lang.hitch(this, this.showSummStatsInputs());
			}
						
            //apply consensus weights
            $('#' + this.id +"applyDefaultDiadromous").on('click',lang.hitch(this,function(e){   
            	lang.hitch(this, this.applyWeights(this.config.diadromous));
            }));
            
            $('#' + this.id +"applyDefaultResident").on('click',lang.hitch(this,function(e){ 
                lang.hitch(this, this.applyWeights(this.config.resident));
            }));
            
            //clear all metric weights, filters, barriers to remove, uncheck all options
            $('#' + this.id +"applyZeroWeight").on('click',lang.hitch(this,function(e){ 
            	lang.hitch(this, this.clearAllInputs());
            }));
			
			//Start custom analysis 
			$('#' + this.id +"submitButton").on('click',lang.hitch(this,function(e){
				console.log("clicked gp button")
				this.submit();
			}));
			
			this.rendered = true;	
		},	

        //calculate current metric weights
        metricWeightCalculator: function (gpVals){
            var sumWeights = 0; 
            for (key in gpVals) {
                if (isNaN(gpVals[key])){
                    console.log("Warning! Must input integers!");
                }
                sumWeights = sumWeights + parseInt(gpVals[key], 10); 
            }
            return sumWeights;
        },

		filterMapService: function(filter, mapServLayer, mapServURL){
			var filterParameters = new ImageParameters();
			var layerDefs = [];
			layerDefs[0] = filter;
			console.log("in function " +filter);
			filterParameters.layerDefinitions = layerDefs;
			filterParameters.layerIds = [0];
			filterParameters.layerOption = ImageParameters.LAYER_OPTION_SHOW;
			filterParameters.transparent = true;
			var filteredMapServLayer = new esri.layers.ArcGISDynamicMapServiceLayer(mapServURL, 
				{"imageParameters" : filterParameters});
	
			return Object(filteredMapServLayer);

		},
		
		clearConsensusFilterMapService: function(){
			this.map.removeLayer(this.dynamicLayer);
			this.dynamicLayer = new esri.layers.ArcGISDynamicMapServiceLayer(this.config.url);
			this.dynamicLayer.setVisibleLayers(this.config.visibleLayers);
			setTimeout(lang.hitch(this, function(){
			    this.map.addLayer(this.dynamicLayer);
			},500));
			
			$('#'+ this.id +"resultsConsensusFilter").val(''); 
			require(["jquery", "plugins/barrier-prioritization-proto/js/chosen.jquery"],lang.hitch(this,function($) {
			    $('#'+ this.id +"filterConsensusResultsField").val('option: first').trigger("chosen:updated");
                $('#'+ this.id +"filterConsensusResultsOperator").val('option: first').trigger("chosen:updated");
                $('#'+ this.id +"filterConsensusResultsValue").val('option: first').trigger("chosen:updated");
			}));
			$( "#" + this.id + "consensusResultFilterSliderTier" ).slider( "values", 0, 1 );
            $( "#" + this.id + "consensusResultFilterSliderTier" ).slider( "values", 1, 20 );
            $( "#" + this.id + "consensusResultFilterSliderSeverity" ).slider( "values", 0, 1 );
            $( "#" + this.id + "consensusResultFilterSliderSeverity" ).slider( "values", 1, 5 );
        
            lang.hitch(this, this.displaySliderSelectedValues("#" + this.id + "consensusResultFilterSliderTier",this.consensusResultFilterSliderTierUI));
			lang.hitch(this, this.displaySliderSelectedValues("#" + this.id + "consensusResultFilterSliderSeverity",this.consensusResultFilterSliderSeverityUI));
  
  		},	
		
		filterConsensusMapServiceSlider: function(values){
			console.log(values);
			this.consensusTierMaxVal = 21-$('#' + this.id + 'consensusResultFilterSliderTier').slider("values", 0);
			this.consensusTierMinVal = 21-$('#' + this.id + 'consensusResultFilterSliderTier').slider("values", 1);
			this.consensusSeverityMinVal = $('#' + this.id + 'consensusResultFilterSliderSeverity').slider("values", 0);
			this.consensusSeverityMaxVal = $('#' + this.id + 'consensusResultFilterSliderSeverity').slider("values", 1);
			this.consensusSeverityRange = [];
			var i=1;
			while (i<=this.consensusSeverityMaxVal){
				if (i>=this.consensusSeverityMinVal){
					this.consensusSeverityRange.push("'" + this.severityDict[i] + " Barrier" + "'");
				}
				i++;
			}
			console.log(this.consensusSeverityRange);
			this.consensusSeverityRangeStr = this.consensusSeverityRange.toString();
			this.consensusFilterQuery = this.config.resultTier + " >= " + this.consensusTierMinVal + " AND " + this.config.resultTier + " <= " + this.consensusTierMaxVal + " AND " + this.config.severityField + " IN (" + this.consensusSeverityRangeStr + ")";
			console.log(this.consensusFilterQuery);
			this.map.removeLayer(this.dynamicLayer);

			this.consensusFilterParameters = new ImageParameters();
			this.layerDefs = [];
			this.layerDefs[0] = this.consensusFilterQuery;
			this.consensusFilterParameters.layerDefinitions = this.layerDefs;
			this.consensusFilterParameters.layerIds = [0];
			this.consensusFilterParameters.layerOption = ImageParameters.LAYER_OPTION_SHOW;
			this.consensusFilterParameters.transparent = true;
			this.dynamicLayer = new esri.layers.ArcGISDynamicMapServiceLayer(this.config.url, 
				{"imageParameters" : this.consensusFilterParameters});
			
			setTimeout(lang.hitch(this, function(){
				console.log(this);
			    this.map.addLayer(this.dynamicLayer);
			    lang.hitch(this, this.refreshIdentify(this.url, this.consensusFilterQuery));	
			    console.log(this.consensusFilterQuery);
			},500));		

			var ischecked = $('#' + this.id + 'toggleLayer').is(':checked');
			if (!ischecked){
				$('#'+ this.id +"toggleLayer").trigger('click');
			}
		},

		displaySliderSelectedValues: function(sliderID, ui){
			$(sliderID).next().find('span').each(lang.hitch(this,function(i,v){
				console.log(ui.values[i]);
				if (sliderID.indexOf('Severity') !== -1){
					var textVal = this.severityDict[ui.values[i]];
				}
				else{var textVal = 21-ui.values[i];}
				console.log(textVal);
				$(v).html(textVal);
			}));
		},


        selectRemovalBarriers: function() {  
            this.removingBarriers = true;
            
           
            console.log("removing barriers");
            this.activateIdentify = false;
            lang.hitch(this, this.refreshIdentify(this.config.url));
            var removeBarrierSymbol = new SimpleMarkerSymbol().setSize(5).setColor(new Color([0,0,0]));
            this.selectedRemoveBarrierSymbol = new SimpleMarkerSymbol().setSize(10).setColor(new Color([255,0,0]));                                      
            var renderer = new SimpleRenderer(removeBarrierSymbol);
            
            this.removeFeatureLayer = new FeatureLayer(this.config.removeSelectionURL);
            this.removeFeatureLayer.setRenderer(renderer);
            this.removeFeatureLayer.MODE_SNAPSHOT;

			// Set layer definition so barriers to remove layer only shows passability level of barriers being analyzed (e.g. Dams only)
            this.severityQueryDict = {
            	'Dams':'Use_Dams',
				'Dams (Excluding Dams with Passage)':'Use_Dams_ExclPassage',
				'Severe':'Use_Severe',
				'Severe (Excluding Dams with Passage)':'Use_Severe_ExclPassage',
				'Significant':'Use_Significant',
				'Moderate':'Use_Moderate',
				'Minor':'Use_Minor',
				'Insignificant':'Use_Insignificant'
            };
            this.severityField = this.severityQueryDict[$('#'+ this.id + 'passability').val()];
            this.severityQuery = this.severityField +' = 1';
            console.log(this.severityQuery);
            this.removeFeatureLayer.setDefinitionExpression(this.severityQuery); 
            this.removeFeatureLayer.dataAttributes = [this.uniqueID, this.severityField];
            this.selectedBarriers = new GraphicsLayer();
            
            //if there's already values in the text box, include the corresponding graphics
			if ($("#" + this.id + 'barriers2Remove').val() != ''){
				lang.hitch(this, this.addSavedBarriersToRemove());
            }
            
            this.removeFeatureLayer.on("click", lang.hitch(this, function(e){

                this.currID = e.graphic.attributes[this.uniqueID];
                console.log(this.currID);
                for (i = 0; i< this.removeFeatureLayer.graphics.length; i++){  
                    if (this.alreadySelBarr2Remove != undefined && this.alreadySelBarr2Remove.indexOf(this.currID)>=0){
                    	console.log(this.currID + "is already selected");
                    }           	
                	//the following statement check if each graphic is either the one clicked on or in the list of previously selected 
                    if (this.removeFeatureLayer.graphics[i].attributes[this.uniqueID] == this.currID ){
                        this.barriers2RemoveCount ++;  
            
                        if (this.barriers2RemoveCount <= 10) {
                            //Make a graphic copy of the selected point.  Changing the symbology of the existing point worked, but then
                            //symbology would revert on zoom in/out
							var key = this.uniqueID;
                            var attr = {};
                            attr[key] = this.removeFeatureLayer.graphics[i].attributes[this.uniqueID];
                            this.selectedBarrier = new Graphic(this.removeFeatureLayer.graphics[i].geometry, this.selectedRemoveBarrierSymbol, attr );
                            this.selectedBarriers.add(this.selectedBarrier);
                             
                            //if an existing selected graphic is clicked remove it and its UNIQUE_ID from String
                            this.selectedBarriers.on("click", lang.hitch(this, function(e){
                                if (this.workingRemoveBarriers.indexOf(e.graphic.attributes[this.uniqueID]) >-1){
                                    this.workingRemoveBarriers.splice(this.workingRemoveBarriers.indexOf(e.graphic.attributes[this.uniqueID]), 1);
                                    this.barriers2RemoveCount --;
                                }
                                this.workingRemoveBarriersString = "'" + this.workingRemoveBarriers.join("', '") + "'";
                                if (this.workingRemoveBarriersString == "''"){this.workingRemoveBarriersString = "";}
                                $("#" + this.id + 'barriers2Remove').val(this.workingRemoveBarriersString);
                                this.selectedBarriers.remove(e.graphic);
                            }));    
                            this.workingRemoveBarriers.push(this.currID);
                            this.workingRemoveBarriersString = "'" + this.workingRemoveBarriers.join("', '") + "'";       
                            $("#" + this.id + 'barriers2Remove').val(this.workingRemoveBarriersString);
                        }
                        else{alert("You may only select 10 barriers");}
                    }
                    else{this.alreadySelBarr2Remove = ""; }
                }   
            }));
          
          this.map.addLayer(this.removeFeatureLayer);
          console.log(this.removeFeatureLayer);
          this.map.addLayer(this.selectedBarriers);
        },
        
        addSavedBarriersToRemove: function(){
    		console.log("there's already barriers to remove listed");
			this.alreadySelBarr2RemoveList = $("#" + this.id + 'barriers2Remove').val().split(",");
			this.alreadySelBarr2RemoveQuery = new Query();
			this.alreadySelBarr2RemoveQueryTask = new QueryTask(this.config.removeSelectionURL);//(this.removeFeatureLayer);
			
			this.alreadySelBarr2RemoveQuery.where = this.config.uniqueID + " IN (" + $("#" + this.appDiv.id + 'barriers2Remove').val() +")";
			
			this.alreadySelBarr2RemoveQuery.returnGeometry = true;
			this.alreadySelBarr2RemoveQuery.outFields = [this.config.uniqueID];
			console.log(this.alreadySelBarr2RemoveQuery);
			console.log(this.alreadySelBarr2RemoveQueryTask);
			this.alreadySelBarr2RemoveQueryTask.execute(this.alreadySelBarr2RemoveQuery,  lang.hitch(this, addQueryResults));
			
			function addQueryResults(results){
				console.log(results);
				for (i = 0; i< results.features.length; i++){  
             		var key = this.uniqueID;
                    var attr2 = {};
                    attr2[key] = results.features[i].attributes[this.config.uniqueID];
                    this.selectedBarrier = new Graphic(results.features[i].geometry, this.selectedRemoveBarrierSymbol, attr2 );
                    this.selectedBarriers.add(this.selectedBarrier);
                    this.barriers2RemoveCount ++; 
                   	
        		} 
        		//if an existing selected graphic is clicked remove it and its UNIQUE_ID from String
                this.selectedBarriers.on("click", lang.hitch(this, function(e){
                    if (this.workingRemoveBarriers.indexOf(e.graphic.attributes[this.uniqueID]) >-1){
                        this.workingRemoveBarriers.splice(this.workingRemoveBarriers.indexOf(e.graphic.attributes[this.uniqueID]), 1);
                        this.barriers2RemoveCount --;
                    }
                    this.workingRemoveBarriersString = "'" + this.workingRemoveBarriers.join("', '") + "'";
                    if (this.workingRemoveBarriersString == "''"){this.workingRemoveBarriersString = "";}
                    $("#" + this.appDiv.id + 'barriers2Remove').val(this.workingRemoveBarriersString);
                    this.selectedBarriers.remove(e.graphic);
                })); 
			}
		},
		
		clearAllInputs: function(){
			// $("#" + this.appDiv.id +"gpStatusReport").html("");
            // $("#" + this.appDiv.id +"gpStatusReportHead").css('display', 'none');
			// $("input[id^=" + this.appDiv.id + "weightIn]").each(lang.hitch(this, function(i, v){
                 // v.value = 0;
                 // $('#' + v.id).removeClass('weighted');            
            // }));
            // $('#'+ this.appDiv.id +"currWeight").html('0');
            // $('#'+ this.appDiv.id +"currWeight").css('color', 'red');
            // $('#'+ this.appDiv.id +"barriers2Remove").val('');
            // $('#'+ this.appDiv.id +"userFilter").val('');      
            // $('#'+ this.appDiv.id +"resultsFilter").val(''); 
            // if ($('#'+ this.appDiv.id +"removeBarriers").is(":checked")){$('#'+ this.appDiv.id +"removeBarriers").trigger('click');}
            // if ($('#'+ this.appDiv.id +"runSumStats").is(":checked")){$('#'+ this.appDiv.id +"runSumStats").trigger('click');}
            // if ($('#'+ this.appDiv.id +"filterBarriers").is(":checked")){
                // $('#'+ this.appDiv.id +"filterBarriers").trigger('click');
            // }
            // require(["jquery", "plugins/barrier-prioritization-proto/js/chosen.jquery"],lang.hitch(this,function($) {
                // $('#'+ this.appDiv.id +"filterBuildField").val('option: first').trigger("chosen:updated");
                // $('#'+ this.appDiv.id +"filterBuildOperator").val('option: first').trigger("chosen:updated");
                // $('#'+ this.appDiv.id +"filterBuildValue").val('option: first').trigger("chosen:updated"); 
                // $('#'+ this.appDiv.id +"filterResultsField").val('option: first').trigger("chosen:updated");
                // $('#'+ this.appDiv.id +"filterResultsOperator").val('option: first').trigger("chosen:updated");
                // $('#'+ this.appDiv.id +"filterResultsValue").val('option: first').trigger("chosen:updated");
                // $('#'+ this.appDiv.id +"passability").val('option: first').trigger("chosen:updated");
                // $('#'+ this.appDiv.id +"summarizeBy").val('option: first').trigger("chosen:updated");
                // $('#'+ this.appDiv.id +"summaryStatField").val('option: first').trigger("chosen:updated");
//                 
            // }));                 
            // if (this.removeFeatureLayer != undefined){
                // this.map.removeLayer(this.removeFeatureLayer);
            // }
            // if (this.selectedBarriers != undefined){
                // this.map.removeLayer(this.selectedBarriers);
            // }           
            this.workingRemoveBarriers = [];
            this.workingRemoveBarriersString = "";
            this.barriers2RemoveCount = 0;
            this.removingBarriers = false;

		},
		
       applyWeights: function(myWeights) {  
            for (var key in myWeights) {
                if (myWeights.hasOwnProperty(key)) {
                    $("#" + this.id + "weightIn-" + key).val(myWeights[key]);
                }
            this.gpVals = {};
            this.weights = $("input[id^=" + this.id + "weightIn]").each(lang.hitch(this, function(i, v){
                this.gpVals[v.id] = v.value;    
                if (parseFloat(v.value) > 0){$('#' + v.id).addClass('weighted');}
                else{$('#' + v.id).removeClass('weighted');}            
            }));
            this.sumWeights = this.metricWeightCalculator(this.gpVals);      
            $('#'+ this.id + "currWeight").text(this.sumWeights);
            if (this.sumWeights !=100){$('#'+ this.id +"currWeight").css('color', 'red');}
            if (this.sumWeights ==100){$('#'+ this.id +"currWeight").css('color', 'green');} 
            }
        },
		
//GP Service

//prepare and pass the GP request object to gpURL
        submit: function(){
            this.gpVals = {};
            this.gpValsList = [];
            this.weights = $("input[id^=" + this.id + "weightIn]").each(lang.hitch(this, function(i, v){
                this.gpVals[v.id] = v.value; 
                this.gpValsList.push(v.value);               
            }));
            this.sumWeights = this.metricWeightCalculator(this.gpVals);
            console.log(this.sumWeights)
            if (this.sumWeights != 100){
                alert("Metric weights must sum to 100");
            }
            else{
                //clear old map graphics and results table
                this.map.graphics.clear();
                if (this.selectedBarriers != undefined){this.map.removeLayer(this.selectedBarriers);}
                if (this.removeFeatureLayer != undefined){this.map.removeLayer(this.removeFeatureLayer);}
                this.tableHTML = "";
                if (this.gpResLayer != undefined){
                    this.map.removeLayer(this.gpResLayer);
                }
               
                
                this.requestObject = {};                
                if($("#" + this.id + "filterBarriers").is(':checked')){this.filterBarr = true;}
                else{this.filterBarr = false;}
			
				//if passability option is an input get it
				if (this.config.includePassabilityOption == true){
					this.passability = $("#" + this.id + "passability").val();
				}

                if ($("#" + this.id + "userFilter").val() != ""){
                  this.filter = $("#" + this.id + "userFilter").val();
                }
                else{this.filter = "";}
                if($("#" + this.id + "removeBarriers").is(':checked')){this.removeBarr = true;}
                else{this.removeBarr = false;}
                this.removeIDs = $("#" + this.id + "barriers2Remove").val();

                if($("#" + this.id + "runSumStats").is(':checked')){this.runSumStats = true;}
                else{this.runSumStats = false;}
                this.summarizeBy = $("#" + this.id + "summarizeBy").val();
                this.sumStatField = $("#" + this.id + "summaryStatField").val();
                
                this.requestObject["Passability"] = this.passability;
                this.requestObject["Take_Average_Value"] = false;
                this.requestObject["FilterBarriers"] = this.filterBarr;
                this.requestObject["UserFilter"] = this.filter;
                this.requestObject["ModelRemoval"] = this.removeBarr;
                this.requestObject["Barriers_for_Modeled_Removal"] = this.removeIDs;
                this.requestObject["Run_Watershed_Summary_Stats"] = this.runSumStats;
                this.requestObject["Summarize_By"] = this.summarizeBy;
                this.requestObject["Summary_Stat_Field"] = this.sumStatField;
                this.weightIterator = 1;

                console.log(this.requestObject);
                this.statusCallbackIterator = 0;
                
                this.gp.submitJob(this.requestObject, lang.hitch(this, this.completeCallback), lang.hitch(this, this.statusCallback), lang.hitch(this, function(error){
                        alert(error);
                        $('#' + this.id +"submitButton").removeClass('submitButtonRunning');
                        $('#' + this.id +"submitButton").prop('disabled', false);
                }));
                
                //disable Submit button so a second analyiss can't be run until the first is finished
                $('#' + this.id +"submitButton").addClass('submitButtonRunning');
                $('#' + this.id +"submitButton").prop('disabled', true);
            
            	ga('send', 'event', {
				    eventCategory:this.config.analyticsEventTrackingCategory,		
				    eventAction: 'submit click', 
				    eventLabel: "Custom analysis on " + this.passability
			 	});
                    
            }
        },

        //GP status
        statusCallback: function(jobInfo) {
            this.status = jobInfo.jobStatus;
            
            if(this.status === "esriJobFailed"){
                alert("There was a problem running the analysis.  Please try again. " + this.status);
                //re-enable Submit button for subsequent analyses
                $('#' + this.id +"submitButton").removeClass('bp_submitButtonRunning');
                $('#' + this.id +"submitButton").prop('disabled', false);
            }
            else{
                $("#" + this.id +"gpStatusReportHead").css("display", "block");
            
                if(this.statusCallbackIterator === 0){console.log("Analysis begun!");}
                if (jobInfo.messages.length > 0){
                    this.messages = jobInfo.messages;
                    this.count = this.messages.length;

                    this.index = this.count-1;                  
                    if (this.count>0) {
                        this.message = this.messages[this.index].description;
                    }
                    if ((this.message != this.updateMessage) && (typeof this.message != 'undefined')){
                        $("#" + this.id +"gpStatusReport").html(this.message);
                        this.updateMessage = this.message;
                    }
                }
                this.statusCallbackIterator ++;
            }
        },
        
        //GP complete            
        completeCallback: function (jobInfo){
                $("#" + this.id +"gpStatusReport").html("Transferring data from server.");
                // Get result as map service -- needed for larger datasets and easy way to get legend
                this.resMapServURLRoot = this.config.gpURL.replace("GPServer/Prioritize", "MapServer/jobs/");
                this.resMapServ =  (this.resMapServURLRoot + jobInfo.jobId);
                this.gpResLayer = new esri.layers.ArcGISDynamicMapServiceLayer(this.resMapServ);
                this.gpResLayer.opacity = 0.8;
                this.map.addLayer(this.gpResLayer);
                console.log("callback complete");
             	this.jobInfo = jobInfo;
                // Get result JSON for graphics and linked table
                if (this.runSumStats == true){
                	this.gp.getResultData(jobInfo.jobId, this.config.summStatsParamName, lang.hitch(this,displayStats));
                	console.log("finished stats");
                }

                if (this.config.tableResults === false){
                	this.gp.getResultData(jobInfo.jobId, this.config.resultsParamName, lang.hitch(this, this.displayResultMapServ));          	
                }
                this.gp.getResultData(jobInfo.jobId, this.config.zippedResultParamName, lang.hitch(this, this.getZippedResultURL));  
                
                this.statusCallbackIterator = 0;
        },

		getZippedResultURL: function (result, messages){
			console.log(result.value.url);
			this.zippedResultURL = result.value.url; //this is accessed when the download button is pressed
		},

		//Display GP Result Map Service  
		displayResultMapServ: function (result, messages){
			console.log("map service results");
			this.gpIterator ++;
		    
		    //re-enable Submit button for subsequent analyses
            $('#' + this.id +"submitButton").removeClass('bp_submitButtonRunning');
            $('#' + this.id +"submitButton").prop('disabled', false);
            
	        //set identify to GP service
            this.identifyRes = new IdentifyTask(this.resMapServ);
            this.activateIdentify = true;
            lang.hitch(this, this.refreshIdentify(this.resMapServ));
                                
		},

//End GP Service		
		
		
		refreshIdentify: function(layerURL, layerDef) {           		
       		if (this.activateIdentify == true){   
                //Identify functionality...     
                this.identifyRes = new IdentifyTask(layerURL);
                this.identifyParams = new IdentifyParameters();
                this.identifyParams.tolerance = 6;
                this.identifyParams.returnGeometry = true;
                this.identifyParams.layerIds = this.config.visibleLayers;
                this.identifyParams.layerDefinitions=[];
                if (layerDef != undefined){
                	this.identifyParams.layerDefinitions[0] = layerDef;
                	console.log("layer def= " + this.identifyParams.layerDefinitions);
                }
                else{this.identifyParams.layerDefinitions = [];}
                this.identifyParams.layerOption = IdentifyParameters.LAYER_OPTION_ALL;
                this.identifyParams.width = this.map.width;
                this.identifyParams.height = this.map.height;
				
        		this.identifyClick = dojo.connect(this.map, "onClick", lang.hitch(this, function(evt) {  
	                this.identifyParams.geometry = evt.mapPoint;
	                this.identifyParams.mapExtent = this.map.extent;      
	                this.deferred = this.identifyRes       
	                    .execute(this.identifyParams)
	                    .addCallback(lang.hitch(this, function (response) {
	                    return arrayUtils.map(response, lang.hitch(this, function (idResult) {
	                    	console.log(this.idResult);
	                        this.IdentifyFeature = idResult.feature;
	                        console.log(this.IdentifyFeature);
	                        this.idContent = "";
	                        $.each(idResult.feature.attributes, lang.hitch(this, function(k, v){
	                            //HTML for identify popup -- loop through and include all fields except those in plugin-config blakclist
	                            if ($.inArray(k, this.config.idBlacklist) == -1){
	                            	if (this.config.metricNames[k] != undefined){this.idContent = this.idContent + "<b>" + this.config.metricNames[k] + "</b> : " + v + "<hr>";}
	                                else{this.idContent = this.idContent + "<b>" + k + "</b> : " + v + "<hr>";}
	                            }
	                        }));
	                        console.log(this.idContent);
	                        this.identJSON = {
	                            title: "Unique ID: ${" + this.uniqueID+ "}",
	                            content: this.idContent
	                        };
	                        
	                        this.popupInfoTemplate = new esri.InfoTemplate(this.identJSON);
	                        this.IdentifyFeature.setInfoTemplate(this.popupInfoTemplate);
	                        console.log(this.IdentifyFeature);
	                        return this.IdentifyFeature;
	                   }));
	                 }));
	                 this.map.infoWindow.setFeatures([this.deferred]);
	                 this.map.infoWindow.show(this.identifyParams.geometry);
	            })); 
          }
          
          else{
          	dojo.disconnect(this.identifyClick);
          	console.log("identify disconnected");
          }
       },
		
		
	});
});