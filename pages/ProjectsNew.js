/**
 * @jsx React.DOM
 */

var React = require('react');
var Q = require('q');
var Router = require('react-router');
var Link = Router.Link;
var RouteHandler = Router.RouteHandler;
var Moment = require('moment');
var _ = require('lodash');
var Mt = window.Mousetrap;

/*components*/
var DateRangePicker = require('../components/DateRangePicker');
var Pinyin = require('../components/Pinyin');
var Scroller = require('../components/Scroller');
var TinyPie = require('../components/charts/TinyPie');


var config = require('../conf/config');
var noop  = function () {};
/** Utils */
var DataAPI = require('../utils/DataAPI');
var Util = require('../utils/Util');

module.exports = React.createClass({
    mixins: [Router.State, Router.Navigation],

    getDefaultProps: function () {
        var startDate = new Moment(config.birthday).toDate(),
            endDate = new Moment().endOf('day').toDate();
        return {
            startDate: startDate,
            endDate: endDate
        };
    },

    getInitialState: function () {
        return _.extend({
            loading: true,
            projects: []
        }, this.getStateFromParams());
    },

    getStateFromParams: function () {
        var params = this.getParams();
        return {
            versionId: params.versionId,
            projectId: params.projectId
        };
    },

    render: function () {
        return (
            <section className="ltt_c-page ltt_c-page-projectsNew">
                <aside className="ltt_c-page-projectsNew-sidebar">
                    <FilterableProjects projects={this.state.projects} ref="filterableProjects"
                        projectId={this.state.projectId}
                        versionId={this.state.versionId}/>
                </aside>
                <main>
                    <RouteHandler {... _.pick(this.state, ['projectId', 'versionId'])}  key={this.state.projectId} onVersionDeleted={this.onVersionDeleted}/>
                </main>
            </section>
        );
    },


    componentDidMount: function () {
        this.loadProjects();
    },


    componentWillReceiveProps: function () {
        this.setState(this.getStateFromParams());
    },

    componentWillUnmount: function () {
        Mt.unbind('command+f');
    },

    onDateRangeChange: function (start, end) {
        this.setState({
            startDate: start,
            endDate: end
        });
        this.loadProjects();
    },

    loadProjects: function () {
        var that = this;
        this.setState({ loading: true });
        DataAPI.Project.load({
            start: this.props.startDate,
            end: this.props.endDate,
            aggregate: false
        }).then(function (projects) {
            that.setState({
                loading: false,
                projects: projects
            });
        });
    },

    onVersionDeleted: function (version) {
        console.log('version deleted', version);
        var project = this.state.projects.filter(function (project) {
            return project._id === version.projectId;
        })[0];
        var index = null;
        project.versions.some(function (ver, i) {
            if (ver._id === version._id) {
                index = i;
                return true;
            }
        });
        if (index !== null) {
            project.versions.splice(index, 1);
        }
        this.setState({
            projects: this.state.projects
        });
        if (!_.isEmpty(project.versions)) {
            this.transitionTo('projectVersionTask', {projectId: project._id, versionId: project.versions[0]._id});
        } else {
            this.transitionTo('projectTask', {projectId: project._id});
        }
    }

});


var FilterableProjects = React.createClass({
    getDefaultProps: function () {
        return {
            projects: [],
            filterEnd: function () {}
        };
    },

    getInitialState: function () {
        return {
            projects: null,
            projectTime: []
        };
    },

    componentDidUpdate: function () {
        if (!this.__inFilterMode && !this.__clickVisit) {
            this.scrollToCurrent();
        }
    },

    scrollToCurrent: function () {
        var currentEl = this.current();
        if (currentEl) {
            this.refs.scroller.scrollToElement(currentEl);
        }
    },

    componentDidMount: function () {
        var that = this;
        var input = this.refs.nameInput;
        Mt.bind('command+f', function (e) {
            e.preventDefault();
            var $input = $(input.getDOMNode());
            $input.focus();
        });
        this.loadTodayProjectTime().then(function (data) {
            that.setState({
                projectTime: data
            });
        });
    },

    render: function () {
        return (
            <div className="ltt_c-page-projectsNew-FilterableList">
                <input ref="nameInput" type="text" placeholder="name/classs/tag"
                        className="ltt_c-page-projectsNew-filter-name"
                        onChange={function(e) {
                            var text = e.target.value;
                            this.filterProject(text);
                        }.bind(this)}/>
                <Scroller className="ltt_c-page-projectsNew-sidebar-projectTree" ref="scroller">
                        {(this.__inFilterMode ? this.state.projects : this.props.projects).map(this.renderProject)}
                </Scroller>
            </div>
        );
    },

    loadTodayProjectTime: function () {
        var that = this;
        return DataAPI.Log.load({
            start: new Moment().startOf('day').toDate(),
            end: new Moment().endOf('day').toDate(),
            group: 'project+version',
            sum: true
        }).then(function (data) {
            var _otherTime = 0;
            var _totalTime = 0;
            var result = data.filter(function (item) {
                var notOther = (item._id !== null && item.project !== null);
                if (notOther) { _otherTime += item.totalTime; }
                return notOther;
            }).map(function (item) {
                var _id = item._id;
                _totalTime += item.totalTime;
                return {
                    project: _id.project,
                    version: _id.version,
                    totalTime: item.totalTime
                };
            });
            that._totalTime = _totalTime;
            that._otherTime = _otherTime;
            return result;
        });
    },

    renderProject: function (project) {
        var projectId = this.props.projectId;
        var versionId = this.props.versionId;
        var isMatch = projectId === project._id;
        var className = isMatch ? 'active' : null;
        var timeData = this.state.projectTime.filter(function (item) {return item.project === project._id;})
        timeData._totalTime = this._totalTime;
        var defaultIsOpen = false;
        if (versionId && !_.isEmpty(project.versions)) {
            defaultIsOpen = project.versions.some(function (ver) {
                return ver._id === versionId;
            });
        }
        return <ProjectNav key={project._id} project={project} className={className}
            timeData={timeData}
            onClick={this.onItemClick}
            onVersionClick={this.onItemClick}
            defaultIsOpen={defaultIsOpen} versionId={this.props.versionId}/>
    },

    onItemClick: function () {
        this.__clickVisit = true;
    },


    filterProject: function (text) {
        var pinyin = new Pinyin();
        text = text.trim();
        this.__inFilterMode = !!text;
        var result = null;
        if (this.__inFilterMode) {
            result = [];
            result = this.props.projects.filter(function (project) {
                var name = project.name;
                var py = pinyin.getCamelChars(name).toLowerCase();
                var fullPy = pinyin.getFullChars(name).toLowerCase();
                var tags = project.tags || [];
                var matchTag = tags.some(function (tag) {
                    var tagPy = pinyin.getCamelChars(tag).toLowerCase();
                    var tagFullPy = pinyin.getFullChars(tag).toLowerCase();
                    return tag.indexOf(text) >= 0 || tagFullPy.indexOf(text) >= 0 || tagPy.indexOf(text) >= 0;
                });
                var matchClass = (project.classes || []).some(function (cls) {
                    var upperCode = cls.toUpperCase();
                    var upperText = text.toUpperCase();
                    return upperCode.indexOf(upperText) >= 0;
                });
                return name.indexOf(text) >= 0 || fullPy.indexOf(text) >= 0 || py.indexOf(text) >= 0 || matchTag || matchClass;
            });
        } else {
            this.__clickVisit = false;
        }
        this.setState({
            projects: result
        }, function () {
            this.refs.scroller.refresh();
        });
    },

    current: function () {
        var $el = $(this.getDOMNode());
        var el = $el.find('.ltt_c-ProjectNav.active')[0];
        if (el) {
            el = $(el).find('.ltt_c-ProjectNav-Item.active')[0] || el;
        }
        return el;
    }
});



var ProjectNav = React.createClass({

  getInitialState: function () {
    return { isOpen: this.props.defaultIsOpen};
  },

  getDefaultProps: function () {
    return {
        defaultIsOpen: false,
        onVersionClick: noop,
        onClick: noop
    };
  },

  toggle: function () {
    this.setState({ isOpen: !this.state.isOpen });
  },

  renderVersions: function () {
    var project = this.props.project;
    var versionId = this.props.versionId;
    var timeData = this.props.timeData;
    return this.state.isOpen ? (project.versions || []).map(function (version) {
        var params = {projectId: project._id, versionId: version._id};
        var className = "ltt_c-ProjectNav-Item";
        if (versionId === version._id) {
            className += ' active';
        }
        var versionTimeData = timeData.filter(function (item) {
            return item.version === version._id;
        })[0];
        var totalVersionTime;
        if (versionTimeData) {
            totalVersionTime = versionTimeData.totalTime;
        }
        return (
            <li className={className} key={version._id} onClick={this.onVersionClick}>
                <i className="fa fa-sitemap" title="version"></i>
                <Link to="projectVersionTask" params={params}>
                    {version.name}
                    {totalVersionTime ? <span className="timeAmount">{Util.displayTime(totalVersionTime)}</span> : null}
                </Link>
            </li>
        );
    }) : null;
  },

  onVersionClick: function () {
      this.props.onVersionClick();
  },

  onClick: function () {
      this.toggle();
      this.props.onClick();
  },

  render: function () {
    var project = this.props.project;
    var className ="ltt_c-ProjectNav";
    var timeData = this.props.timeData;
    var totalProjectTime;
    if (!_.isEmpty(timeData)) {
        totalProjectTime = timeData.reduce(function (total, item) {return total + item.totalTime}, 0);
    }
    if (this.props.className) {
        className += ' ' + this.props.className;
    }
    var params = {projectId: project._id};
    var iconClassName = ('fa ' + (this.state.isOpen ? 'fa-folder-open-o' : 'fa-folder-o'));
    var percentValue;
    if (timeData._totalTime) {
        percentValue = [totalProjectTime, timeData._totalTime].join('/');
    }
    return (
      <div className={className}>
        <h3 onClick={this.onClick}>
            <i className={iconClassName}/>
            <Link to="projectTask" params={params}>
                {project.name}
                {totalProjectTime ?
                    <span className="timeAmount">
                        {Util.displayTime(totalProjectTime)}
                        {percentValue !== undefined ? <TinyPie value={percentValue} height={10} width={10} fill={['#ff9900', "#FFF8EA"]}/> : null}
                    </span> : null}
            </Link>
        </h3>
        <ul>{this.renderVersions()}</ul>
      </div>
    );
  }
});
