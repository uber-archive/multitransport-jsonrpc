window.onload = function() {
    // Toggle the menu up/down
    document.getElementById('menubutton').onclick = function() {
        document.getElementById('menu').classList.toggle('selected');
    };
    // Fix the CSS for the section list at the bottom
    var sectionCount = document.getElementById('sectionlist').childElementCount;
    var sectionCss = document.createElement('style');
    sectionCss.setAttribute('type', 'text/css');
    sectionCss.setAttribute('media', 'screen');
    sectionCss.appendChild(document.createTextNode('#sectionbar > ol > li { width: ' + parseInt(100/sectionCount) + '%; }'));
    document.getElementsByTagName('head')[0].appendChild(sectionCss);
    // Get list of section ids for section list
    var sections = Array.prototype.filter.call(document.getElementById('sectionlist').childNodes, function(child) {
        return child.nodeType === 1;
    }).map(function(listChild) {
        return {
            section: document.getElementById(listChild.firstElementChild.hash.replace(/^#/, '')),
            name: listChild.firstElementChild.firstChild.data,
            center: listChild.offsetLeft + (listChild.offsetWidth / 2)
        };
    });

    // Build the CSS rules for the car circle to travel to
    var carCircleCss = document.createElement('style');
    carCircleCss.setAttribute('type', 'text/css');
    carCircleCss.setAttribute('media', 'screen');
    var carCircleCssString = '';
    
    for(var i = 0; i < sections.length; i++) {
        carCircleCssString += '.section' + i + ' { left: ' + (sections[i].center - 25) + 'px; }\n';
    }
    
    carCircleCss.appendChild(document.createTextNode(carCircleCssString));
    document.getElementsByTagName('head')[0].appendChild(carCircleCss);
    
    // Add the logic to determine where the car circle should be
    function setCarCircleLocation() {
        var carCircle = document.getElementById('highlightedSection');
        var titleText = document.getElementById('titletext');
        for(var i = 0; i < sections.length; i++) {
            if(sections[i].section.offsetTop >= window.scrollY - 128 && sections[i].section.offsetTop < window.scrollY + window.innerHeight - 128) {
                carCircle.className = 'section' + i;
                titleText.innerHTML = sections[i].name;
                break;
            }
        }
    }
    
    window.onscroll = setCarCircleLocation;
    setCarCircleLocation();
    
    // Make the section menu visible
    Array.prototype.forEach.call(document.getElementsByClassName('initiallyHidden'), function(element) {
        element.classList.toggle('initiallyHidden');
    });
};